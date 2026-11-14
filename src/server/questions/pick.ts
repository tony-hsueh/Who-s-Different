import type { QuestionPair } from './bank.js';

export function recentWindowSize(bankLength: number): number {
  return Math.max(0, Math.min(10, bankLength - 1));
}

// recentIds: the room's past picks, oldest first.
export function pickQuestion({
  bank,
  recentIds,
  rng,
}: {
  bank: readonly QuestionPair[];
  recentIds: readonly string[];
  rng: () => number;
}): QuestionPair {
  if (bank.length === 0) throw new Error('question bank is empty');

  const n = recentWindowSize(bank.length);
  const excluded = new Set(n > 0 ? recentIds.slice(-n) : []);
  const candidates = bank.filter((q) => !excluded.has(q.id));

  // A round is bank.length picks. Within a round every pair comes up once.
  // Assumes the bank does not change during a room's life (it only changes
  // on deploy, which resets rooms).
  const playedThisRound = recentIds.length % bank.length;
  const usedThisRound = new Set(
    playedThisRound > 0 ? recentIds.slice(-playedThisRound) : [],
  );
  const unused = candidates.filter((q) => !usedThisRound.has(q.id));
  // Only empty when recentIds does not follow the round shape (e.g. ids
  // from an older bank); fall back to any pair outside the last N.
  const pool = unused.length > 0 ? unused : candidates;
  const index = Math.min(Math.floor(rng() * pool.length), pool.length - 1);
  return pool[index]!;
}
