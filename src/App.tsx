import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchHistory, fetchRanking, registerScore } from './api/client';
import type { NetworkScenarioName, RegisterMatchRequest, RankingEntry, MatchHistoryEntry } from './api/contracts';
import { readScenarioState, resetMockStore, writeScenarioState } from './api/msw';
import { clearOutbox, enqueueSubmission, failSubmission, markSubmissionInFlight, readOutbox, removeSubmission } from './api/outbox';
import { DEFAULT_GAME_SETTINGS, type GameConfigSnapshot, type GameSettingsFormState } from './game/config/types';
import { createNormalizedInputState, normalizeInputState, toSimulationInput, type NormalizedInputState } from './game/inpupt';
import { GamePixiRenderer, type AssetProgress } from './game/render';
import { createInitialGameState, formatTime, step, type GameState } from './game/sim';
import { getGameUiSnapshot, publishGameUiSnapshot, resetGameUiSnapshot, subscribeToGameUi } from './ui/gameUiStore';
import './App.css';

type Screen = 'menu' | 'options' | 'match' | 'result';

type MatchResultRecord = {
  score: number;
  durationMs: number;
  endedAt: string;
  reason: string;
};

type TestGameSnapshot = {
  status: GameState['status'];
  score: number;
  elapsedMs: number;
  remainingMs: number;
  player: {
    hp: number;
    maxHp: number;
    position: { x: number; y: number };
  };
  enemies: Array<{ id: string; type: string; hp: number; maxHp: number; alive: boolean }>;
  projectiles: Array<{ id: string; owner: string; alive: boolean }>;
};

type TestGameHarness = {
  setSeed: (seed: number) => void;
  readState: () => TestGameSnapshot | null;
  startMatch: () => void;
  pause: () => void;
  resume: () => void;
  pressKey: (key: 'left' | 'right' | 'up' | 'fireFront' | 'fireLeft' | 'fireRight' | 'pause', pressed: boolean) => void;
  advance: (ms: number) => void;
};

declare global {
  interface Window {
    __game?: TestGameHarness;
  }
}

const SETTINGS_KEY = 'pirate-game.settings.v1';
const LAST_RESULT_KEY = 'pirate-game.last-result.v1';
const defaultInputState = () => createNormalizedInputState();

const isValidSettings = (value: unknown): value is GameSettingsFormState => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.sessionSeconds === 'number' &&
    Number.isFinite(candidate.sessionSeconds) &&
    candidate.sessionSeconds >= 60 &&
    candidate.sessionSeconds <= 180 &&
    typeof candidate.spawnIntervalMs === 'number' &&
    Number.isFinite(candidate.spawnIntervalMs) &&
    candidate.spawnIntervalMs >= 1000 &&
    candidate.spawnIntervalMs <= 20000
  );
};

const isValidResult = (value: unknown): value is MatchResultRecord => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.score === 'number' &&
    Number.isFinite(candidate.score) &&
    typeof candidate.durationMs === 'number' &&
    Number.isFinite(candidate.durationMs) &&
    typeof candidate.endedAt === 'string' &&
    typeof candidate.reason === 'string'
  );
};

const readStoredSettings = (): GameSettingsFormState => {
  if (typeof window === 'undefined') return { ...DEFAULT_GAME_SETTINGS };

  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_GAME_SETTINGS };
    const parsed = JSON.parse(raw) as unknown;
    return isValidSettings(parsed) ? parsed : { ...DEFAULT_GAME_SETTINGS };
  } catch {
    return { ...DEFAULT_GAME_SETTINGS };
  }
};

const readStoredResult = (): MatchResultRecord | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(LAST_RESULT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidResult(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const writeStoredSettings = (settings: GameSettingsFormState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

const writeStoredResult = (result: MatchResultRecord) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result));
};

function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [settings, setSettings] = useState<GameSettingsFormState>(() => readStoredSettings());
  const [result, setResult] = useState<MatchResultRecord | null>(() => readStoredResult());
  const [game, setGame] = useState<GameState | null>(null);
  const [assetProgress, setAssetProgress] = useState<AssetProgress>({
    loaded: 0,
    total: 1,
    percent: 0,
  });
  const [assetError, setAssetError] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [touchInput, setTouchInput] = useState<NormalizedInputState>(defaultInputState());
  const [liveAnnouncement, setLiveAnnouncement] = useState('');
  const [validationErrors, setValidationErrors] = useState<Partial<Record<keyof GameSettingsFormState, string>>>({});
  const [isPaused, setIsPaused] = useState(false);
  const [scenario, setScenario] = useState<NetworkScenarioName>(() => readScenarioState().name);

  const inputRef = useRef<NormalizedInputState>(defaultInputState());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<GamePixiRenderer | null>(null);
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joystickPointerId = useRef<number | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const matchIdRef = useRef<string | null>(null);
  const uiSnapshot = useSyncExternalStore(subscribeToGameUi, getGameUiSnapshot, getGameUiSnapshot);
  const lastHudRef = useRef({ status: 'idle' as GameState['status'], hp: 0, score: 0 });
  const queryClient = useQueryClient();

  const syncInputState = (next: Partial<NormalizedInputState>) => {
    const merged = normalizeInputState({ ...inputRef.current, ...next });
    inputRef.current = merged;
    setTouchInput(merged);
  };

  const resetInput = () => {
    inputRef.current = defaultInputState();
    setTouchInput(defaultInputState());
  };

  const readTestState = (): TestGameSnapshot | null => {
    const current = gameRef.current;
    if (!current) return null;

    return {
      status: current.status,
      score: current.score,
      elapsedMs: current.elapsedMs,
      remainingMs: current.remainingMs,
      player: {
        hp: current.player.hp,
        maxHp: current.player.maxHp,
        position: { ...current.player.position },
      },
      enemies: current.enemies.map((enemy) => ({
        id: enemy.id,
        type: enemy.type,
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        alive: enemy.alive,
      })),
      projectiles: current.projectiles.map((projectile) => ({
        id: projectile.id,
        owner: projectile.owner,
        alive: projectile.alive,
      })),
    };
  };

  const startMatch = () => {
    const snapshot: Partial<GameConfigSnapshot> = {
      sessionSeconds: settings.sessionSeconds,
      spawnIntervalMs: settings.spawnIntervalMs,
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
    };

    const nextGame = createInitialGameState(1234, snapshot);
    matchIdRef.current = crypto.randomUUID();
    gameRef.current = nextGame;
    setGame(nextGame);
    setIsPaused(false);
    resetInput();
    setScreen('match');
    setAssetError(null);
  };

  const setGameStatus = (status: GameState['status']) => {
    const current = gameRef.current;
    if (!current || current.status === 'finished') return;
    if (current.status === status) return;

    const next = { ...current, status };
    gameRef.current = next;
    setGame(next);
  };

  const resumeMatch = () => {
    setIsPaused(false);
    setGameStatus('running');
    resetInput();
  };

  const clearPause = (source: 'manual' | 'blur' | 'visibility') => {
    setIsPaused(true);
    setGameStatus('paused');
    resetInput();
    setLiveAnnouncement(source === 'manual' ? 'Game paused.' : 'Game paused because the page lost focus.');
  };

  const validateSettings = (candidate: GameSettingsFormState) => {
    const nextErrors: Partial<Record<keyof GameSettingsFormState, string>> = {};

    if (candidate.sessionSeconds < 60 || candidate.sessionSeconds > 180) {
      nextErrors.sessionSeconds = 'Session length must be between 60 and 180 seconds.';
    }

    if (candidate.spawnIntervalMs < 1000 || candidate.spawnIntervalMs > 20000) {
      nextErrors.spawnIntervalMs = 'Spawn interval must be between 1000ms and 20000ms.';
    }

    setValidationErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveSettings = () => {
    if (!validateSettings(settings)) return;
    writeStoredSettings(settings);
    setScreen('menu');
    setLiveAnnouncement('Settings saved.');
  };

  const rankingQuery = useQuery({
    queryKey: ['ranking', { page: 1, pageSize: 5, sortBy: 'score', order: 'desc' }],
    queryFn: () => fetchRanking({ page: 1, pageSize: 5, sortBy: 'score', order: 'desc' }),
    staleTime: 15_000,
  });

  const historyQuery = useQuery({
    queryKey: ['history', { playerId: 'pirate-player', page: 1, pageSize: 5, sortBy: 'completedAt', order: 'desc' }],
    queryFn: () => fetchHistory({ playerId: 'pirate-player', page: 1, pageSize: 5, sortBy: 'completedAt', order: 'desc' }),
    staleTime: 15_000,
  });

  const registerScoreMutation = useMutation({
    mutationFn: async (request: RegisterMatchRequest) => registerScore(request),
    onSuccess: async (_, request) => {
      removeSubmission(request.matchId);
      await queryClient.invalidateQueries({ queryKey: ['ranking'] });
      await queryClient.invalidateQueries({ queryKey: ['history'] });
    },
    onError: (_, request) => {
      markSubmissionInFlight(request.matchId);
      failSubmission(request.matchId);
      setLiveAnnouncement('Submission queued for retry.');
    },
  });

  const flushOutbox = async () => {
    const queue = readOutbox();
    for (const item of queue) {
      try {
        await registerScore(item.request);
        removeSubmission(item.id);
      } catch {
        break;
      }
    }
  };

  useEffect(() => {
    void flushOutbox();
  }, []);

  const handleScenarioChange = (value: NetworkScenarioName) => {
    const next = readScenarioState();
    const scenarioState = { ...next, name: value, latencyMs: value === 'slow' ? 1800 : value === 'timeout' ? 5000 : 120 };
    writeScenarioState(scenarioState);
    setScenario(value);
    clearOutbox();
    void queryClient.invalidateQueries({ queryKey: ['ranking'] });
    void queryClient.invalidateQueries({ queryKey: ['history'] });
  };

  const resetScenarioData = () => {
    resetMockStore();
    setScenario('success');
    clearOutbox();
    void queryClient.invalidateQueries({ queryKey: ['ranking'] });
    void queryClient.invalidateQueries({ queryKey: ['history'] });
  };

  const matchReady = screen === 'match' && game !== null && !assetError && assetProgress.percent >= 100;
  const gameplayActive = matchReady && game.status === 'running' && !isPaused;

  const quitToMenu = () => {
    setScreen('menu');
    setGame(null);
    setIsPaused(false);
    resetInput();
    setLiveAnnouncement('Returned to the main menu.');
  };

  const restartMatch = () => {
    startMatch();
  };

  const advanceTestClock = (ms: number) => {
    setGame((previous) => {
      if (!previous) return previous;
      return step(
        previous,
        toSimulationInput({ ...inputRef.current, paused: isPaused || inputRef.current.paused }),
        Math.max(0, ms) / 1000,
      );
    });
  };

  useEffect(() => {
    const isTestMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('test') === '1';
    if (!isTestMode) return undefined;

    const harness: TestGameHarness = {
      setSeed: (seed) => {
        const nextState = createInitialGameState(seed, {
          sessionSeconds: settings.sessionSeconds,
          spawnIntervalMs: settings.spawnIntervalMs,
          version: '1.0.0',
          updatedAt: new Date().toISOString(),
        });
        setGame(nextState);
        gameRef.current = nextState;
        setScreen('match');
        setIsPaused(false);
        setGameStatus('running');
        resetInput();
      },
      readState: readTestState,
      startMatch,
      pause: () => {
        setIsPaused(true);
        const current = gameRef.current;
        if (current && current.status !== 'finished') {
          const next = { ...current, status: 'paused' as const };
          gameRef.current = next;
          setGame(next);
        }
        resetInput();
      },
      resume: () => {
        setIsPaused(false);
        const current = gameRef.current;
        if (current && current.status !== 'finished') {
          const next = { ...current, status: 'running' as const };
          gameRef.current = next;
          setGame(next);
        }
        resetInput();
      },
      pressKey: (key, pressed) => {
        const eventMap: Record<NonNullable<TestGameHarness['pressKey']> extends (...args: infer A) => unknown ? A[0] : never, string> = {
          left: 'ArrowLeft',
          right: 'ArrowRight',
          up: 'ArrowUp',
          fireFront: ' ',
          fireLeft: 'q',
          fireRight: 'e',
          pause: 'p',
        };

        const nativeKey = eventMap[key];
        if (!nativeKey) return;
        window.dispatchEvent(new KeyboardEvent(pressed ? 'keydown' : 'keyup', { key: nativeKey, bubbles: true }));
      },
      advance: advanceTestClock,
    };

    window.__game = harness;
    return () => {
      delete window.__game;
    };
  }, [settings.sessionSeconds, settings.spawnIntervalMs, isPaused]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!matchReady) {
      resetInput();
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['arrowleft', 'a', 'arrowright', 'd', 'arrowup', 'w', ' ', 'q', 'e', 'p'].includes(key)) {
        event.preventDefault();
      }

      if (key === 'arrowleft' || key === 'a') {
        if (!isPaused) syncInputState({ turnLeft: true, turnRight: false });
      }
      if (key === 'arrowright' || key === 'd') {
        if (!isPaused) syncInputState({ turnRight: true, turnLeft: false });
      }
      if (key === 'arrowup' || key === 'w') {
        if (!isPaused) syncInputState({ thrust: 1 });
      }
      if (key === ' ') {
        if (!isPaused) syncInputState({ fireFront: true });
      }
      if (key === 'q') {
        if (!isPaused) syncInputState({ fireLeft: true });
      }
      if (key === 'e') {
        if (!isPaused) syncInputState({ fireRight: true });
      }
      if (key === 'p' && !event.repeat) {
        setIsPaused((previous) => {
          const next = !previous;
          setGameStatus(next ? 'paused' : 'running');
          return next;
        });
        resetInput();
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === 'arrowleft' || key === 'a') syncInputState({ turnLeft: false });
      if (key === 'arrowright' || key === 'd') syncInputState({ turnRight: false });
      if (key === 'arrowup' || key === 'w') syncInputState({ thrust: 0 });
      if (key === ' ') syncInputState({ fireFront: false });
      if (key === 'q') syncInputState({ fireLeft: false });
      if (key === 'e') syncInputState({ fireRight: false });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [matchReady, isPaused]);

  useEffect(() => {
    if (screen !== 'match' || !game) return;

    const handlePageBlur = () => clearPause('blur');
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        clearPause('visibility');
      }
    };

    window.addEventListener('blur', handlePageBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handlePageBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [screen, game]);

  useEffect(() => {
    if (screen !== 'match' || !game) return;

    let frameId = 0;
    let last = performance.now();
    let lastUiEmit = 0;

    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;

      setGame((previous) => {
        if (!previous) return previous;

        const next = step(previous, toSimulationInput({ ...inputRef.current, paused: isPaused || inputRef.current.paused }), dt);

        if (now - lastUiEmit >= 100) {
          publishGameUiSnapshot({
            score: next.score,
            timeLeftMs: next.remainingMs,
            hp: next.player.hp,
            maxHp: next.player.maxHp,
            status: isPaused ? 'paused' : next.status,
          });
          lastUiEmit = now;
        }

        return next;
      });

      frameId = window.requestAnimationFrame(tick);
    };

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [screen, isPaused, game]);

  useEffect(() => {
    const host = containerRef.current;
    if (!host || screen !== 'match') {
      return undefined;
    }

    const controller = new AbortController();
    const renderer = new GamePixiRenderer();
    rendererRef.current = renderer;

    let mounted = true;

    void (async () => {
      try {
        await renderer.init({
          container: host,
          signal: controller.signal,
          onProgress: (progress) => {
            if (mounted) setAssetProgress(progress);
          },
          onError: (error) => {
            if (mounted) setAssetError(error.message || 'Failed to initialize PixiJS.');
          },
        });

        if (mounted && !controller.signal.aborted) setAssetError(null);
      } catch (error) {
        if (mounted && !controller.signal.aborted) {
          setAssetError(error instanceof Error ? error.message : 'Failed to initialize PixiJS.');
        }
      }
    })();

    return () => {
      mounted = false;
      controller.abort();
      renderer.destroy();
      rendererRef.current = null;
    };
  }, [screen, renderVersion]);

  useEffect(() => {
    if (screen === 'match' && rendererRef.current && game) {
      rendererRef.current.updateFromState(game);
    }
  }, [screen, game]);

  useEffect(() => {
    if (screen === 'match' && game && game.status === 'finished') {
      const durationMs = Math.max(0, game.elapsedMs);
      const record: MatchResultRecord = {
        score: game.score,
        durationMs,
        endedAt: new Date().toISOString(),
        reason: game.lastEvent ?? 'time_expired',
      };

      const request: RegisterMatchRequest = {
        matchId: matchIdRef.current ?? crypto.randomUUID(),
        playerId: 'pirate-player',
        playerName: 'Captain',
        score: game.score,
        durationMs,
        endReason: game.lastEvent ?? 'time_expired',
        config: game.config,
      };

      enqueueSubmission(request);
      void registerScoreMutation.mutateAsync(request).catch(() => undefined);

      setResult(record);
      writeStoredResult(record);
      setScreen('result');
      setIsPaused(false);
      resetInput();
    }
  }, [game, screen]);

  useEffect(() => {
    const current = {
      status: uiSnapshot.status,
      hp: uiSnapshot.hp,
      score: uiSnapshot.score,
    };

    const previous = lastHudRef.current;

    if (current.status !== previous.status) {
      setLiveAnnouncement(current.status === 'finished' ? 'Match finished.' : current.status === 'paused' ? 'Game paused.' : 'Match running.');
    } else if (current.hp !== previous.hp && current.hp <= previous.hp) {
      setLiveAnnouncement(`Ship hit. Health at ${current.hp} of ${uiSnapshot.maxHp}.`);
    } else if (current.score !== previous.score) {
      setLiveAnnouncement(`Score updated to ${current.score}.`);
    }

    lastHudRef.current = current;
  }, [uiSnapshot]);

  useEffect(() => {
    if (!game) return;
    resetGameUiSnapshot();
    publishGameUiSnapshot({
      score: game.score,
      timeLeftMs: game.remainingMs,
      hp: game.player.hp,
      maxHp: game.player.maxHp,
      status: isPaused ? 'paused' : game.status,
    });
  }, [game, isPaused]);

  const updateJoystickFromPointer = (clientX: number, clientY: number) => {
    const node = joystickRef.current;
    if (!node || !gameplayActive) return;

    const rect = node.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = clientX - centerX;
    const dy = clientY - centerY;
    const radius = rect.width * 0.32;
    const clampedX = Math.max(-1, Math.min(1, dx / radius));
    const clampedY = Math.max(0, Math.min(1, -dy / radius));

    syncInputState({
      turnLeft: clampedX < -0.15,
      turnRight: clampedX > 0.15,
      thrust: clampedY,
    });
  };

  const releaseJoystick = () => {
    joystickPointerId.current = null;
    syncInputState({ turnLeft: false, turnRight: false, thrust: 0 });
  };

  const setWeaponButton = (key: 'fireFront' | 'fireLeft' | 'fireRight', pressed: boolean) => {
    syncInputState({ [key]: pressed });
  };

  const isLoading = assetProgress.loaded < assetProgress.total || (assetError === null && assetProgress.percent === 0);

  const renderMatchScreen = () => (
    <>
      <header className="hud-bar">
        <div><strong>Score</strong><span>{uiSnapshot.score}</span></div>
        <div><strong>Time</strong><span>{formatTime(uiSnapshot.timeLeftMs)}</span></div>
        <div><strong>HP</strong><span>{uiSnapshot.hp}/{uiSnapshot.maxHp}</span></div>
        <div><strong>Status</strong><span>{isPaused ? 'paused' : uiSnapshot.status}</span></div>
      </header>

      <div className="arena-shell">
        <div ref={containerRef} className="arena-stage" aria-label="Pirate battle arena" style={{ width: '100%', height: '100%' }} />

        {isPaused && (
          <div className="pause-overlay" aria-live="polite">
            <div className="pause-menu">
              <h2>Paused</h2>
              <div className="pause-actions">
                <button type="button" className="primary" onClick={resumeMatch}>Resume</button>
                <button type="button" className="secondary" onClick={restartMatch}>Restart</button>
                <button type="button" className="secondary" onClick={quitToMenu}>Main menu</button>
              </div>
            </div>
          </div>
        )}

        {gameplayActive ? (
          <div className="touch-controls" aria-label="Touch controls">
            <div
              ref={joystickRef}
              className="virtual-joystick"
              onPointerDown={(event) => {
                joystickPointerId.current = event.pointerId;
                event.currentTarget.setPointerCapture(event.pointerId);
                updateJoystickFromPointer(event.clientX, event.clientY);
              }}
              onPointerMove={(event) => {
                if (joystickPointerId.current !== event.pointerId) return;
                updateJoystickFromPointer(event.clientX, event.clientY);
              }}
              onPointerUp={() => releaseJoystick()}
              onPointerCancel={() => releaseJoystick()}
              onPointerLeave={() => {
                if (joystickPointerId.current === null) releaseJoystick();
              }}
            >
              <div
                className="joystick-knob"
                style={{
                  transform: `translate(${((touchInput.turnRight ? 1 : 0) - (touchInput.turnLeft ? 1 : 0)) * 28}px, ${-(touchInput.thrust || 0) * 28}px)`,
                }}
              />
            </div>

            <div className="weapon-buttons">
              <button type="button" className="weapon-button front" onPointerDown={(event) => { event.preventDefault(); setWeaponButton('fireFront', true); }} onPointerUp={() => setWeaponButton('fireFront', false)} onPointerLeave={() => setWeaponButton('fireFront', false)} onPointerCancel={() => setWeaponButton('fireFront', false)}>Front</button>
              <button type="button" className="weapon-button left" onPointerDown={(event) => { event.preventDefault(); setWeaponButton('fireLeft', true); }} onPointerUp={() => setWeaponButton('fireLeft', false)} onPointerLeave={() => setWeaponButton('fireLeft', false)} onPointerCancel={() => setWeaponButton('fireLeft', false)}>Left</button>
              <button type="button" className="weapon-button right" onPointerDown={(event) => { event.preventDefault(); setWeaponButton('fireRight', true); }} onPointerUp={() => setWeaponButton('fireRight', false)} onPointerLeave={() => setWeaponButton('fireRight', false)} onPointerCancel={() => setWeaponButton('fireRight', false)}>Right</button>
            </div>
          </div>
        ) : null}

        {assetError ? (
          <div className="loading-overlay error"><p>{assetError}</p><button type="button" onClick={() => setRenderVersion((current) => current + 1)}>Retry</button></div>
        ) : isLoading ? (
          <div className="loading-overlay"><p>Loading assets</p><strong>{Math.round(assetProgress.percent)}%</strong></div>
        ) : null}
      </div>

      <footer className="controls">
        <span>W / ↑ = thrust</span>
        <span>A / D / ← / → = rotate</span>
        <span>Space = front fire</span>
        <span>Q / E = side fire</span>
        <span>P = pause</span>
      </footer>
    </>
  );

  return (
    <main className="app-shell">
      {screen === 'menu' && (
        <section className="panel screen-panel">
          <h1>Pirate Battle</h1>
          <p>Navigate the waters, destroy enemy ships and survive the match.</p>
          <div className="stack-actions">
            <button type="button" className="primary" onClick={startMatch}>Play</button>
            <button type="button" className="secondary" onClick={() => setScreen('options')}>Options</button>
          </div>

          <div className="api-panel">
            <label className="scenario-picker">
              <span>Mock scenario</span>
              <select value={scenario} onChange={(event) => handleScenarioChange(event.target.value as NetworkScenarioName)}>
                <option value="success">Success</option>
                <option value="empty">Empty</option>
                <option value="slow">Slow</option>
                <option value="timeout">Timeout</option>
                <option value="http-4xx">HTTP 4xx</option>
                <option value="http-5xx">HTTP 5xx</option>
                <option value="network-error">Network error</option>
                <option value="out-of-order">Out of order</option>
              </select>
            </label>
            <button type="button" className="secondary" onClick={resetScenarioData}>Reset mock</button>
          </div>

          {result ? (
            <div className="result-summary">
              <h2>Last result</h2>
              <p>Score: {result.score}</p>
              <p>Duration: {formatTime(result.durationMs)}</p>
              <p>Reason: {result.reason}</p>
            </div>
          ) : null}

          <div className="dashboard-grid">
            <div className="mini-panel">
              <h2>Ranking</h2>
              {rankingQuery.isLoading ? <p>Loading ranking…</p> : (
                <ul>
                  {(rankingQuery.data?.items ?? []).map((entry: RankingEntry) => (
                    <li key={entry.id}>#{entry.rank} {entry.playerName} — {entry.score}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mini-panel">
              <h2>History</h2>
              {historyQuery.isLoading ? <p>Loading history…</p> : (
                <ul>
                  {(historyQuery.data?.items ?? []).map((entry: MatchHistoryEntry) => (
                    <li key={entry.id}>{entry.playerName} — {entry.score} ({entry.endReason})</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {screen === 'options' && (
        <section className="panel screen-panel">
          <h1>Options</h1>
          <div className="form-grid">
            <label>
              <span>Session length (seconds)</span>
              <input
                type="number"
                min={60}
                max={180}
                value={settings.sessionSeconds}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setSettings((current) => ({ ...current, sessionSeconds: nextValue }));
                  validateSettings({ ...settings, sessionSeconds: nextValue });
                }}
              />
              {validationErrors.sessionSeconds ? <small>{validationErrors.sessionSeconds}</small> : null}
            </label>
            <label>
              <span>Spawn interval (ms)</span>
              <input
                type="number"
                min={1000}
                max={20000}
                value={settings.spawnIntervalMs}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  setSettings((current) => ({ ...current, spawnIntervalMs: nextValue }));
                  validateSettings({ ...settings, spawnIntervalMs: nextValue });
                }}
              />
              {validationErrors.spawnIntervalMs ? <small>{validationErrors.spawnIntervalMs}</small> : null}
            </label>
          </div>
          <div className="stack-actions">
            <button type="button" className="primary" onClick={saveSettings}>Save</button>
            <button type="button" className="secondary" onClick={() => setScreen('menu')}>Back</button>
          </div>
        </section>
      )}

      {screen === 'match' && renderMatchScreen()}

      {screen === 'result' && (
        <section className="panel screen-panel">
          <h1>Match result</h1>
          {result ? (
            <>
              <p><strong>Score:</strong> {result.score}</p>
              <p><strong>Time:</strong> {formatTime(result.durationMs)}</p>
              <p><strong>Reason:</strong> {result.reason}</p>
              <p><strong>Finished at:</strong> {new Date(result.endedAt).toLocaleString()}</p>
            </>
          ) : (
            <p>No result recorded.</p>
          )}
          <div className="stack-actions">
            <button type="button" className="primary" onClick={startMatch}>Play again</button>
            <button type="button" className="secondary" onClick={() => { setGame(null); setScreen('menu'); }}>Main menu</button>
          </div>
        </section>
      )}

      <div className="sr-only" aria-live="polite" aria-atomic="true">{liveAnnouncement}</div>
    </main>
  );
}

export default App;
