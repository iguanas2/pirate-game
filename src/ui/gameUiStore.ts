import type { MatchStatus } from '../game/sim';

export interface GameUiSnapshot {
  score: number;
  timeLeftMs: number;
  hp: number;
  maxHp: number;
  status: MatchStatus;
  updatedAt: number;
}

const initialSnapshot: GameUiSnapshot = {
  score: 0,
  timeLeftMs: 0,
  hp: 0,
  maxHp: 0,
  status: 'idle',
  updatedAt: 0,
};

const listeners = new Set<() => void>();
let snapshot = initialSnapshot;

export const getGameUiSnapshot = (): GameUiSnapshot => snapshot;

export const subscribeToGameUi = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const publishGameUiSnapshot = (partial: Partial<GameUiSnapshot>) => {
  snapshot = {
    ...snapshot,
    ...partial,
    updatedAt: performance.now(),
  };

  listeners.forEach((listener) => listener());
};

export const resetGameUiSnapshot = () => {
  snapshot = initialSnapshot;
  listeners.forEach((listener) => listener());
};
