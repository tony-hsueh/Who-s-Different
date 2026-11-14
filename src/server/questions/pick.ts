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

  const used = new Set(recentIds);
  const unused = candidates.filter((q) => !used.has(q.id));
  if (unused.length > 0) {
    const index = Math.min(
      Math.floor(rng() * unused.length),
      unused.length - 1,
    );
    return unused[index]!;
  }

  // Every candidate was used before: take the least recently used one.
  let best = candidates[0]!;
  let bestLast = recentIds.lastIndexOf(best.id);
  for (const q of candidates) {
    const last = recentIds.lastIndexOf(q.id);
    if (last < bestLast) {
      best = q;
      bestLast = last;
    }
  }
  return best;
}
