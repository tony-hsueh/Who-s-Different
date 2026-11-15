import { describe, expect, it } from 'vitest';
import { questionBank, type QuestionPair } from './bank.js';
import { pickQuestion, recentWindowSize } from './pick.js';
import { validateBank } from './validate.js';

// mulberry32: a tiny seeded PRNG so the "fixed seed" cases are reproducible.
function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pair(id: string, wordA = `${id}-A`, wordB = `${id}-B`): QuestionPair {
  return { id, wordA, wordB, category: '測試', difficulty: 'easy' };
}

function makeBank(size: number): QuestionPair[] {
  return Array.from({ length: size }, (_, i) => pair(`q${i}`));
}

describe('questionBank', () => {
  it('has at least 30 pairs across at least 5 categories and passes validateBank', () => {
    expect(questionBank.length).toBeGreaterThanOrEqual(30);
    expect(
      new Set(questionBank.map((q) => q.category)).size,
    ).toBeGreaterThanOrEqual(5);
    expect(() => validateBank(questionBank)).not.toThrow();
  });

  it('includes the ten PRD example pairs', () => {
    const prdExamples: [string, string][] = [
      ['火鍋', '麻辣燙'],
      ['捷運', '火車'],
      ['咖啡', '奶茶'],
      ['飯店', '民宿'],
      ['貓', '狗'],
      ['電影', '電視劇'],
      ['牛排', '燒肉'],
      ['便利商店', '超級市場'],
      ['蛋糕', '鬆餅'],
      ['百貨公司', '購物中心'],
    ];
    const pairs = new Set(questionBank.map((q) => `${q.wordA}/${q.wordB}`));
    for (const [a, b] of prdExamples) {
      expect(pairs).toContain(`${a}/${b}`);
    }
  });
});

describe('validateBank', () => {
  it('accepts a valid bank', () => {
    expect(() => validateBank(makeBank(3))).not.toThrow();
  });

  it('rejects duplicate ids', () => {
    expect(() =>
      validateBank([pair('dup', '甲', '乙'), pair('dup', '丙', '丁')]),
    ).toThrow(/dup/);
  });

  it('rejects a pair whose two words are the same', () => {
    expect(() => validateBank([pair('same', '貓', '貓')])).toThrow(/same/);
  });

  it('rejects empty or blank words', () => {
    expect(() => validateBank([pair('emptyA', '', '狗')])).toThrow(/emptyA/);
    expect(() => validateBank([pair('blankB', '貓', '   ')])).toThrow(/blankB/);
  });

  it('rejects the same pair listed twice with A and B swapped', () => {
    expect(() =>
      validateBank([pair('one', '貓', '狗'), pair('two', '狗', '貓')]),
    ).toThrow(/two/);
  });

  it('rejects the same pair listed twice in the same order', () => {
    expect(() =>
      validateBank([pair('one', '貓', '狗'), pair('two', '貓', '狗')]),
    ).toThrow(/two/);
  });

  it('treats words that differ only by surrounding spaces as the same word', () => {
    expect(() => validateBank([pair('pad', '貓', ' 貓 ')])).toThrow(/pad/);
    expect(() =>
      validateBank([pair('one', '貓', '狗'), pair('two', ' 狗', '貓 ')]),
    ).toThrow(/two/);
  });

  it('reports every problem in one error', () => {
    expect(() =>
      validateBank([pair('x', '貓', '貓'), pair('y', '', '狗')]),
    ).toThrow(/x[\s\S]*y/);
  });
});

describe('recentWindowSize', () => {
  it('is min(10, bank.length - 1)', () => {
    expect(recentWindowSize(36)).toBe(10);
    expect(recentWindowSize(11)).toBe(10);
    expect(recentWindowSize(5)).toBe(4);
    expect(recentWindowSize(1)).toBe(0);
  });
});

describe('pickQuestion', () => {
  it('can pick any pair when recentIds is empty', () => {
    const bank = makeBank(5);
    const picked = new Set<string>();
    for (let i = 0; i < bank.length; i++) {
      const r = (i + 0.5) / bank.length;
      picked.add(pickQuestion({ bank, recentIds: [], rng: () => r }).id);
    }
    expect(picked).toEqual(new Set(bank.map((q) => q.id)));
  });

  it('stays inside the bank for rng values at the edges of [0, 1)', () => {
    const bank = makeBank(4);
    expect(pickQuestion({ bank, recentIds: [], rng: () => 0 }).id).toBe('q0');
    expect(
      pickQuestion({ bank, recentIds: [], rng: () => 0.999999999 }).id,
    ).toBe('q3');
  });

  it('does not repeat across 10 consecutive picks with a fixed seed', () => {
    const rng = seededRng(42);
    const recentIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      recentIds.push(pickQuestion({ bank: questionBank, recentIds, rng }).id);
    }
    expect(new Set(recentIds).size).toBe(10);
  });

  it('gives the same sequence for the same seed', () => {
    const run = (seed: number) => {
      const rng = seededRng(seed);
      const recentIds: string[] = [];
      for (let i = 0; i < 10; i++) {
        recentIds.push(pickQuestion({ bank: questionBank, recentIds, rng }).id);
      }
      return recentIds;
    };
    expect(run(7)).toEqual(run(7));
  });

  it('never picks one of the last N ids', () => {
    const bank = makeBank(3);
    // N = 2, so q1 and q2 are excluded even though rng points at them.
    expect(
      pickQuestion({ bank, recentIds: ['q1', 'q2'], rng: () => 0.99 }).id,
    ).toBe('q0');
    expect(
      pickQuestion({ bank, recentIds: ['q2', 'q0'], rng: () => 0 }).id,
    ).toBe('q1');
  });

  it('prefers pairs the room has never used', () => {
    const bank = makeBank(15);
    // q0..q2 used long ago (outside the window of 10), q3..q4 never used.
    const recentIds = ['q0', 'q1', 'q2', ...bank.slice(5).map((q) => q.id)];
    for (const r of [0, 0.3, 0.6, 0.99]) {
      expect(['q3', 'q4']).toContain(
        pickQuestion({ bank, recentIds, rng: () => r }).id,
      );
    }
  });

  it('starts a new round outside the last N once every pair has been used', () => {
    const bank = makeBank(15);
    // Round 1 done; the last 10 are q5..q14, so round 2 opens with q0..q4.
    const recentIds = bank.map((q) => q.id);
    const picked = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = (i + 0.5) / 5;
      picked.add(pickQuestion({ bank, recentIds, rng: () => r }).id);
    }
    expect(picked).toEqual(new Set(['q0', 'q1', 'q2', 'q3', 'q4']));
  });

  it('uses every pair exactly once in each round', () => {
    const rng = seededRng(7);
    const recentIds: string[] = [];
    const rounds = 5;
    for (let i = 0; i < questionBank.length * rounds; i++) {
      recentIds.push(pickQuestion({ bank: questionBank, recentIds, rng }).id);
    }
    const all = new Set(questionBank.map((q) => q.id));
    for (let round = 0; round < rounds; round++) {
      const ids = recentIds.slice(
        round * questionBank.length,
        (round + 1) * questionBank.length,
      );
      expect(new Set(ids)).toEqual(all);
    }
  });

  it('picks only pairs not yet used this round', () => {
    const bank = makeBank(15);
    // Round 2 has used q0..q2 so far. Window of 10 covers q8..q14 and q0..q2,
    // and q0..q2 are used this round, so only q3..q7 are allowed.
    const recentIds = [...bank.map((q) => q.id), 'q0', 'q1', 'q2'];
    const picked = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const r = (i + 0.5) / 5;
      picked.add(pickQuestion({ bank, recentIds, rng: () => r }).id);
    }
    expect(picked).toEqual(new Set(['q3', 'q4', 'q5', 'q6', 'q7']));
  });

  it('does not replay the first round order in the second round', () => {
    const rng = seededRng(99);
    const recentIds: string[] = [];
    for (let i = 0; i < questionBank.length * 2; i++) {
      recentIds.push(pickQuestion({ bank: questionBank, recentIds, rng }).id);
    }
    const first = recentIds.slice(0, questionBank.length);
    const second = recentIds.slice(questionBank.length);
    expect(new Set(first).size).toBe(questionBank.length);
    expect(second).not.toEqual(first);
  });

  it('keeps picking after the bank runs out, without throwing or repeating within the window', () => {
    const rng = seededRng(2024);
    const recentIds: string[] = [];
    const n = recentWindowSize(questionBank.length);
    for (let i = 0; i < questionBank.length * 5; i++) {
      const { id } = pickQuestion({ bank: questionBank, recentIds, rng });
      expect(recentIds.slice(-n)).not.toContain(id);
      recentIds.push(id);
    }
    expect(new Set(recentIds).size).toBe(questionBank.length);
  });

  it('ignores ids that are not in the bank', () => {
    const bank = makeBank(2);
    expect(
      pickQuestion({ bank, recentIds: ['gone', 'q0'], rng: () => 0 }).id,
    ).toBe('q1');
  });

  it('returns the only pair of a one-pair bank every time', () => {
    const bank = makeBank(1);
    expect(
      pickQuestion({ bank, recentIds: ['q0', 'q0'], rng: () => 0.5 }).id,
    ).toBe('q0');
  });

  it('throws on an empty bank', () => {
    expect(() =>
      pickQuestion({ bank: [], recentIds: [], rng: () => 0 }),
    ).toThrow();
  });
});
