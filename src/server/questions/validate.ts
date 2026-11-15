import type { QuestionPair } from './bank.js';

// Collects every problem and throws a single error listing them all.
export function validateBank(bank: readonly QuestionPair[]): void {
  const problems: string[] = [];
  const ids = new Set<string>();
  const pairs = new Set<string>();

  for (const q of bank) {
    const a = q.wordA.trim();
    const b = q.wordB.trim();

    if (ids.has(q.id)) problems.push(`${q.id}: duplicate id`);
    ids.add(q.id);

    if (a === '' || b === '') {
      problems.push(`${q.id}: empty word`);
      continue;
    }
    if (a === b) {
      problems.push(`${q.id}: wordA and wordB are the same`);
      continue;
    }

    const key = JSON.stringify([a, b].sort());
    if (pairs.has(key)) problems.push(`${q.id}: word pair already used`);
    pairs.add(key);
  }

  if (problems.length > 0) {
    throw new Error(`invalid question bank:\n${problems.join('\n')}`);
  }
}
