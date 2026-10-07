import type { GameConfigSnapshot } from '../game/config';
import type { MatchEndReason } from '../game/sim';

export type NetworkScenarioName =
  | 'success'
  | 'empty'
  | 'slow'
  | 'timeout'
  | 'http-4xx'
  | 'http-5xx'
  | 'network-error'
  | 'out-of-order';

export type PersistedRecordStatus = 'pending' | 'confirmed' | 'failed';

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiError {
  code: string;
  message: string;
  status?: number;
  retryable: boolean;
}

export interface RankingEntry {
  id: string;
  playerId: string;
  playerName: string;
  score: number;
  config: GameConfigSnapshot;
  submittedAt: string;
  rank: number;
}

export interface RankingPage extends PageMeta {
  items: RankingEntry[];
}

export interface MatchHistoryEntry {
  id: string;
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  durationMs: number;
  endReason: MatchEndReason;
  config: GameConfigSnapshot;
  completedAt: string;
  status: PersistedRecordStatus;
}

export interface MatchHistoryPage extends PageMeta {
  items: MatchHistoryEntry[];
}

export interface FetchRankingQuery extends PaginationParams {
  sortBy?: 'score' | 'submittedAt';
  order?: 'asc' | 'desc';
}

export interface FetchHistoryQuery extends PaginationParams {
  playerId: string;
  sortBy?: 'completedAt' | 'score';
  order?: 'asc' | 'desc';
}

export interface RegisterMatchRequest {
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  durationMs: number;
  endReason: MatchEndReason;
  config: GameConfigSnapshot;
}

export interface RegisterMatchResponse {
  matchId: string;
  created: boolean;
  record: MatchHistoryEntry;
  ranking: RankingEntry;
}

export interface PendingSubmission {
  id: string;
  request: RegisterMatchRequest;
  submittedAt: string;
  retryCount: number;
  status: 'queued' | 'sending' | 'failed';
}

export interface NetworkScenarioState {
  name: NetworkScenarioName;
  enabled: boolean;
  latencyMs: number;
  seed: number;
}

export interface RankingResourceContract {
  getRanking: (query: FetchRankingQuery) => Promise<RankingPage>;
  registerScore: (payload: RegisterMatchRequest) => Promise<RegisterMatchResponse>;
}

export interface MatchHistoryResourceContract {
  getHistory: (query: FetchHistoryQuery) => Promise<MatchHistoryPage>;
  saveResult: (payload: RegisterMatchRequest) => Promise<RegisterMatchResponse>;
}
