import axios from 'axios';
import type {
  FetchHistoryQuery,
  FetchRankingQuery,
  MatchHistoryPage,
  RankingPage,
  RegisterMatchRequest,
  RegisterMatchResponse,
} from './contracts';

export const api = axios.create({
  baseURL: '/api',
  timeout: 4000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fetchRanking = async (query: FetchRankingQuery): Promise<RankingPage> => {
  const response = await api.get<RankingPage>('/ranking', {
    params: {
      ...query,
      sortBy: query.sortBy ?? 'score',
      order: query.order ?? 'desc',
    },
  });

  return response.data;
};

export const fetchHistory = async (query: FetchHistoryQuery): Promise<MatchHistoryPage> => {
  const response = await api.get<MatchHistoryPage>('/history', {
    params: {
      ...query,
      sortBy: query.sortBy ?? 'completedAt',
      order: query.order ?? 'desc',
    },
  });

  return response.data;
};

export const registerScore = async (payload: RegisterMatchRequest): Promise<RegisterMatchResponse> => {
  const response = await api.post<RegisterMatchResponse>('/scores', payload);
  return response.data;
};
