import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import type {
  FetchHistoryQuery,
  FetchRankingQuery,
  MatchHistoryEntry,
  MatchHistoryPage,
  NetworkScenarioName,
  RankingEntry,
  RankingPage,
  RegisterMatchRequest,
  RegisterMatchResponse,
} from './contracts';

const DB_KEY = 'pirate-game.msw-store.v1';
const SCENARIO_KEY = 'pirate-game.msw-scenario.v1';

const defaultScenario: Record<NetworkScenarioName, { enabled: boolean; latencyMs: number }> = {
  success: { enabled: true, latencyMs: 120 },
  empty: { enabled: true, latencyMs: 120 },
  slow: { enabled: true, latencyMs: 1800 },
  timeout: { enabled: true, latencyMs: 5000 },
  'http-4xx': { enabled: true, latencyMs: 100 },
  'http-5xx': { enabled: true, latencyMs: 100 },
  'network-error': { enabled: true, latencyMs: 50 },
  'out-of-order': { enabled: true, latencyMs: 1000 },
};

export type ScenarioState = {
  name: NetworkScenarioName;
  enabled: boolean;
  latencyMs: number;
  seed: number;
};

const defaultState: ScenarioState = {
  name: 'success',
  enabled: true,
  latencyMs: 120,
  seed: 1,
};

const parseScenarioState = (): ScenarioState => {
  if (typeof window === 'undefined') return defaultState;

  try {
    const raw = window.localStorage.getItem(SCENARIO_KEY);
    if (!raw) return defaultState;
    const parsed = JSON.parse(raw) as Partial<ScenarioState>;
    const name = parsed.name && parsed.name in defaultScenario ? parsed.name : defaultState.name;
    return {
      name: name as NetworkScenarioName,
      enabled: parsed.enabled ?? true,
      latencyMs: parsed.latencyMs ?? defaultScenario[name as NetworkScenarioName].latencyMs,
      seed: parsed.seed ?? 1,
    };
  } catch {
    return defaultState;
  }
};

export const readScenarioState = (): ScenarioState => parseScenarioState();

export const writeScenarioState = (next: ScenarioState) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(SCENARIO_KEY, JSON.stringify(next));
};

export const resetScenario = () => {
  writeScenarioState(defaultState);
};

const createEmptyDb = () => ({ history: [] as MatchHistoryEntry[] });

const readDb = (): { history: MatchHistoryEntry[] } => {
  if (typeof window === 'undefined') return createEmptyDb();

  try {
    const raw = window.localStorage.getItem(DB_KEY);
    if (!raw) {
      const initial = createEmptyDb();
      window.localStorage.setItem(DB_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as { history?: MatchHistoryEntry[] };
    return {
      history: Array.isArray(parsed.history) ? parsed.history : [],
    };
  } catch {
    return createEmptyDb();
  }
};

const writeDb = (db: { history: MatchHistoryEntry[] }) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DB_KEY, JSON.stringify(db));
};

const sortHistoryForRanking = (items: MatchHistoryEntry[]) =>
  [...items].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.durationMs !== right.durationMs) return left.durationMs - right.durationMs;
    if (left.completedAt !== right.completedAt) return left.completedAt.localeCompare(right.completedAt);
    return left.matchId.localeCompare(right.matchId);
  });

const toRankingEntry = (entry: MatchHistoryEntry, rank: number): RankingEntry => ({
  id: entry.id,
  playerId: entry.playerId,
  playerName: entry.playerName,
  score: entry.score,
  config: entry.config,
  submittedAt: entry.completedAt,
  rank,
});

const pageSlice = <T,>(items: T[], page: number, pageSize: number) => {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
};

const scenarioLatency = async (scenario: ScenarioState) => {
  if (!scenario.enabled) return;
  if (scenario.name === 'slow') {
    await new Promise((resolve) => setTimeout(resolve, scenario.latencyMs || 1800));
  }
  if (scenario.name === 'timeout') {
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }
};

const buildRankingPage = (db: { history: MatchHistoryEntry[] }, query: FetchRankingQuery): RankingPage => {
  const items = sortHistoryForRanking(db.history.filter((entry) => entry.status === 'confirmed'));
  const sorted = items.map((item, index) => toRankingEntry(item, index + 1));
  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.max(1, Number(query.pageSize ?? 10));
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sliced = pageSlice(sorted, page, pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    items: sliced,
  };
};

const buildHistoryPage = (db: { history: MatchHistoryEntry[] }, query: FetchHistoryQuery): MatchHistoryPage => {
  const playerId = query.playerId || 'anon';
  const items = [...db.history]
    .filter((entry) => entry.playerId === playerId)
    .sort((left, right) => {
      if (left.score !== right.score) return right.score - left.score;
      return right.completedAt.localeCompare(left.completedAt);
    });

  const page = Math.max(1, Number(query.page ?? 1));
  const pageSize = Math.max(1, Number(query.pageSize ?? 10));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return {
    page,
    pageSize,
    total,
    totalPages,
    items: pageSlice(items, page, pageSize),
  };
};

const resolveScenario = async (scenario: ScenarioState) => {
  if (scenario.name === 'empty') {
    return HttpResponse.json({ items: [], page: 1, pageSize: 10, total: 0, totalPages: 1 }, { status: 200 });
  }

  if (scenario.name === 'slow') {
    await new Promise((resolve) => setTimeout(resolve, scenario.latencyMs ?? 1500));
  }

  if (scenario.name === 'timeout') {
    await new Promise((resolve) => setTimeout(resolve, 8000));
  }

  if (scenario.name === 'http-4xx') {
    return HttpResponse.json({ code: 'bad_request', message: 'Scenario forced 4xx', retryable: false }, { status: 400 });
  }

  if (scenario.name === 'http-5xx') {
    return HttpResponse.json({ code: 'server_error', message: 'Scenario forced 5xx', retryable: true }, { status: 500 });
  }

  if (scenario.name === 'network-error') {
    return HttpResponse.error();
  }

  return null;
};

export const startMockApi = async () => {
  if (typeof window === 'undefined') return;

  const worker = setupWorker(
    http.get('/api/ranking', async ({ request }) => {
      const scenario = readScenarioState();
      const override = await resolveScenario(scenario);
      if (override) return override;

      await scenarioLatency(scenario);

      const url = new URL(request.url);
      const query = {
        page: Number(url.searchParams.get('page') ?? 1),
        pageSize: Number(url.searchParams.get('pageSize') ?? 10),
        sortBy: (url.searchParams.get('sortBy') as 'score' | 'submittedAt') ?? 'score',
        order: (url.searchParams.get('order') as 'asc' | 'desc') ?? 'desc',
      } satisfies FetchRankingQuery;

      const db = readDb();
      return HttpResponse.json(buildRankingPage(db, query));
    }),

    http.get('/api/history', async ({ request }) => {
      const scenario = readScenarioState();
      const override = await resolveScenario(scenario);
      if (override) return override;

      await scenarioLatency(scenario);

      const url = new URL(request.url);
      const query = {
        playerId: url.searchParams.get('playerId') ?? 'pirate-player',
        page: Number(url.searchParams.get('page') ?? 1),
        pageSize: Number(url.searchParams.get('pageSize') ?? 10),
        sortBy: (url.searchParams.get('sortBy') as 'completedAt' | 'score') ?? 'completedAt',
        order: (url.searchParams.get('order') as 'asc' | 'desc') ?? 'desc',
      } satisfies FetchHistoryQuery;

      const db = readDb();
      return HttpResponse.json(buildHistoryPage(db, query));
    }),

    http.post('/api/scores', async ({ request }) => {
      const scenario = readScenarioState();
      const override = await resolveScenario(scenario);
      if (override) return override;

      const payload = (await request.json()) as RegisterMatchRequest;
      const db = readDb();
      const existingEntry = db.history.find((entry) => entry.matchId === payload.matchId);
      if (existingEntry) {
        return HttpResponse.json({
          matchId: existingEntry.matchId,
          created: false,
          record: existingEntry,
          ranking: toRankingEntry(existingEntry, sortHistoryForRanking(db.history.filter((entry) => entry.status === 'confirmed')).findIndex((entry) => entry.matchId === existingEntry.matchId) + 1),
        } satisfies RegisterMatchResponse);
      }

      const entry: MatchHistoryEntry = {
        id: `history-${crypto.randomUUID()}`,
        matchId: payload.matchId,
        playerId: payload.playerId,
        playerName: payload.playerName,
        score: payload.score,
        durationMs: payload.durationMs,
        endReason: payload.endReason,
        config: payload.config,
        completedAt: new Date().toISOString(),
        status: 'confirmed',
      };

      db.history = [entry, ...db.history];
      writeDb(db);

      const ranking = sortHistoryForRanking(db.history.filter((entry) => entry.status === 'confirmed'));
      const rankingEntry = toRankingEntry(entry, ranking.findIndex((candidate) => candidate.matchId === entry.matchId) + 1);

      return HttpResponse.json({
        matchId: entry.matchId,
        created: true,
        record: entry,
        ranking: rankingEntry,
      } satisfies RegisterMatchResponse);
    }),
  );

  await worker.start();
  return worker;
};

export const resetMockStore = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(DB_KEY);
  window.localStorage.removeItem(SCENARIO_KEY);
  writeScenarioState(defaultState);
};
