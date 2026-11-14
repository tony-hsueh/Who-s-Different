import { describe, expect, it } from 'vitest';
import { createSeededRng, shuffle } from './random.js';

describe('createSeededRng', () => {
  it('returns the same sequence for the same seed', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('returns values in [0, 1)', () => {
    const rng = createSeededRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = Object.freeze([1, 2, 3, 4, 5, 6]);
    const out = shuffle(input, createSeededRng(3));
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(out).not.toBe(input);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(shuffle(items, createSeededRng(5))).toEqual(
      shuffle(items, createSeededRng(5)),
    );
    const results = new Set(
      Array.from({ length: 20 }, (_, i) =>
        shuffle(items, createSeededRng(i)).join(),
      ),
    );
    expect(results.size).toBeGreaterThan(1);
  });
});
