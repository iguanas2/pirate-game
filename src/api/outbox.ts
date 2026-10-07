import type { PendingSubmission, RegisterMatchRequest } from './contracts';

const OUTBOX_KEY = 'pirate-game.outbox.v1';

export const readOutbox = (): PendingSubmission[] => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingSubmission[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const writeOutbox = (items: PendingSubmission[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
};

export const enqueueSubmission = (request: RegisterMatchRequest) => {
  const items = readOutbox();
  const pending: PendingSubmission = {
    id: request.matchId,
    request,
    submittedAt: new Date().toISOString(),
    retryCount: 0,
    status: 'queued',
  };

  const next = [pending, ...items.filter((item) => item.id !== request.matchId)];
  writeOutbox(next);
  return pending;
};

export const removeSubmission = (matchId: string) => {
  const next = readOutbox().filter((item) => item.id !== matchId);
  writeOutbox(next);
};

export const markSubmissionInFlight = (matchId: string) => {
  const items = readOutbox();
  const next: PendingSubmission[] = items.map((item) =>
    item.id === matchId ? { ...item, status: 'sending', retryCount: item.retryCount + 1 } : item,
  );
  writeOutbox(next);
};

export const failSubmission = (matchId: string) => {
  const items = readOutbox();
  const next: PendingSubmission[] = items.map((item) =>
    item.id === matchId ? { ...item, status: 'failed' } : item,
  );
  writeOutbox(next);
};

export const clearOutbox = () => {
  writeOutbox([]);
};
