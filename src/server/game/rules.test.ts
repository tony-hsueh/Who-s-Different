import { describe, expect, it } from 'vitest';
import type {
  GameState,
  Role,
  RuleResult,
  WordPair,
} from '../../shared/game-types.js';
import { createSeededRng } from './random.js';
import {
  checkWinner,
  countAlive,
  createGame,
  eliminate,
  minorityCountFor,
  nextRound,
  skipRound,
} from './rules.js';

const pair: WordPair = { id: 'p1', wordA: '拿鐵', wordB: '美式' };

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

function unwrap(result: RuleResult): GameState {
  if (!result.ok) throw new Error(`${result.code}: ${result.message}`);
  return result.state;
}

function start(n: number, seed = 1): GameState {
  return unwrap(
    createGame({
      playerIds: ids(n),
      pair,
      rng: createSeededRng(seed),
      gameId: 'g1',
    }),
  );
}

type Ids = [string, string, string, string, string, string];

function idsOfRole(state: GameState, role: Role): Ids {
  return state.players
    .filter((p) => p.role === role)
    .map((p) => p.playerId) as Ids;
}

function eliminateAndAdvance(state: GameState, playerId: string): GameState {
  const after = unwrap(eliminate(state, playerId));
  return after.phase === 'reveal' ? unwrap(nextRound(after)) : after;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('minorityCountFor', () => {
  it.each([
    [4, 1],
    [5, 1],
    [6, 1],
    [7, 2],
    [8, 2],
    [9, 2],
    [10, 2],
    [11, 3],
    [12, 3],
    [13, 3],
    [14, 3],
    [15, 3],
  ])('%i players -> %i minority', (n, expected) => {
    expect(minorityCountFor(n)).toBe(expected);
  });

  it.each([3, 16])('13. throws for %i players (out of range)', (n) => {
    expect(() => minorityCountFor(n)).toThrow();
  });

  it('throws for a non-integer player count', () => {
    expect(() => minorityCountFor(4.5)).toThrow();
  });
});

describe('createGame', () => {
  it.each(Array.from({ length: 12 }, (_, i) => i + 4))(
    '1. %i players get the right minority and majority counts',
    (n) => {
      const state = start(n);
      const minority = minorityCountFor(n);
      expect(state.players).toHaveLength(n);
      expect(idsOfRole(state, 'minority')).toHaveLength(minority);
      expect(idsOfRole(state, 'majority')).toHaveLength(n - minority);
    },
  );

  it('2. majority share one word, minority share the other, both from the pair', () => {
    const state = start(8, 11);
    expect(state.majorityWord).not.toBe(state.minorityWord);
    expect([state.majorityWord, state.minorityWord].sort()).toEqual(
      [pair.wordA, pair.wordB].sort(),
    );
    for (const p of state.players) {
      expect(p.secretWord).toBe(
        p.role === 'majority' ? state.majorityWord : state.minorityWord,
      );
    }
  });

  it('starts in round 1 playing with no eliminations and no winner', () => {
    const state = start(6);
    expect(state).toMatchObject({
      gameId: 'g1',
      phase: 'playing',
      roundNumber: 1,
      questionPairId: 'p1',
      eliminations: [],
    });
    expect(state.winner).toBeUndefined();
    expect(state.players.every((p) => !p.eliminated)).toBe(true);
  });

  it('keeps the input order of players', () => {
    expect(start(9, 4).players.map((p) => p.playerId)).toEqual(ids(9));
  });

  it('3. varies which word is majority and who is minority across seeds', () => {
    const majorityWords = new Set<string>();
    const minorityPlayers = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const state = start(6, seed);
      majorityWords.add(state.majorityWord);
      idsOfRole(state, 'minority').forEach((id) => minorityPlayers.add(id));
    }
    expect(majorityWords).toEqual(new Set([pair.wordA, pair.wordB]));
    expect(minorityPlayers).toEqual(new Set(ids(6)));
  });

  it('is deterministic for a given seed', () => {
    expect(start(10, 9)).toEqual(start(10, 9));
  });

  it.each([0, 3, 16])('13. %i players cannot create a game', (n) => {
    const result = createGame({
      playerIds: ids(n),
      pair,
      rng: createSeededRng(1),
      gameId: 'g1',
    });
    expect(result).toMatchObject({ ok: false, code: 'INVALID_PLAYER_COUNT' });
  });

  it('rejects duplicate player ids', () => {
    const result = createGame({
      playerIds: ['a', 'b', 'c', 'a'],
      pair,
      rng: createSeededRng(1),
      gameId: 'g1',
    });
    expect(result).toMatchObject({ ok: false, code: 'DUPLICATE_PLAYER' });
  });

  it('can start a fresh game again from the same inputs', () => {
    const first = start(5, 2);
    const second = start(5, 2);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
  });

  it('accepts a pair that carries extra fields', () => {
    const extended = { ...pair, category: 'drink', difficulty: 1 };
    const result = createGame({
      playerIds: ids(4),
      pair: extended,
      rng: createSeededRng(1),
      gameId: 'g2',
    });
    expect(result.ok).toBe(true);
  });
});

describe('eliminate', () => {
  it('4. eliminating a majority player reveals without a winner', () => {
    const state = start(7);
    const target = idsOfRole(state, 'majority')[0];
    const after = unwrap(eliminate(state, target));
    expect(after.phase).toBe('reveal');
    expect(after.winner).toBeUndefined();
    const player = after.players.find((p) => p.playerId === target)!;
    expect(player).toMatchObject({ eliminated: true, eliminatedInRound: 1 });
    expect(after.eliminations).toEqual([
      { roundNumber: 1, playerId: target, role: 'majority' },
    ]);
    expect(after.lastEliminationRound).toBe(1);
  });

  it('5. eliminating a minority player reveals when minority remain (7 players, 2 minority)', () => {
    const state = start(7);
    const target = idsOfRole(state, 'minority')[0];
    const after = unwrap(eliminate(state, target));
    expect(after.phase).toBe('reveal');
    expect(after.winner).toBeUndefined();
    expect(after.eliminations[0]).toMatchObject({ role: 'minority' });
  });

  it('5. eliminating the only minority in a 4-player game finishes it', () => {
    const state = start(4);
    const after = unwrap(eliminate(state, idsOfRole(state, 'minority')[0]));
    expect(after.phase).toBe('finished');
    expect(after.winner).toBe('majority');
  });

  it('6. all minority eliminated means majority wins and the game finishes', () => {
    let state = start(7, 3);
    const [m1, m2] = idsOfRole(state, 'minority');
    state = eliminateAndAdvance(state, m1);
    expect(state.phase).toBe('playing');
    state = unwrap(eliminate(state, m2));
    expect(state).toMatchObject({ phase: 'finished', winner: 'majority' });
  });

  it('7. PRD example: 8 players (2 minority) end when alive minority >= alive majority at 2 vs 2', () => {
    let state = start(8, 5);
    expect(countAlive(state)).toEqual({ majority: 6, minority: 2 });
    const majority = idsOfRole(state, 'majority');

    state = eliminateAndAdvance(state, majority[0]);
    state = eliminateAndAdvance(state, majority[1]);
    state = eliminateAndAdvance(state, majority[2]);
    expect(countAlive(state)).toEqual({ majority: 3, minority: 2 });
    expect(state.phase).toBe('playing');
    expect(state.winner).toBeUndefined();

    state = unwrap(eliminate(state, majority[3]));
    expect(countAlive(state)).toEqual({ majority: 2, minority: 2 });
    expect(state).toMatchObject({ phase: 'finished', winner: 'minority' });
  });

  it('7. 3 vs 2 does not end the game', () => {
    const state = start(8, 5);
    const majority = idsOfRole(state, 'majority');
    let after = eliminateAndAdvance(state, majority[0]);
    after = eliminateAndAdvance(after, majority[1]);
    after = unwrap(eliminate(after, majority[2]));
    expect(countAlive(after)).toEqual({ majority: 3, minority: 2 });
    expect(after.phase).toBe('reveal');
    expect(checkWinner(after)).toBeUndefined();
  });

  it('8. an already eliminated player cannot be eliminated again', () => {
    const state = start(7);
    const target = idsOfRole(state, 'majority')[0];
    const next = unwrap(nextRound(unwrap(eliminate(state, target))));
    expect(eliminate(next, target)).toMatchObject({
      ok: false,
      code: 'ALREADY_ELIMINATED',
    });
  });

  it('9. cannot eliminate twice in one round', () => {
    const state = start(7);
    const [a, b] = idsOfRole(state, 'majority');
    const revealed = unwrap(eliminate(state, a));
    expect(eliminate(revealed, b)).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
  });

  it('rejects an unknown player', () => {
    expect(eliminate(start(5), 'ghost')).toMatchObject({
      ok: false,
      code: 'PLAYER_NOT_FOUND',
    });
  });

  it('records the elimination on the round it happened in', () => {
    let state = start(8, 2);
    const majority = idsOfRole(state, 'majority');
    state = eliminateAndAdvance(state, majority[0]);
    state = unwrap(skipRound(state));
    state = unwrap(eliminate(state, majority[1]));
    expect(state.eliminations).toEqual([
      { roundNumber: 1, playerId: majority[0], role: 'majority' },
      { roundNumber: 2, playerId: null },
      { roundNumber: 3, playerId: majority[1], role: 'majority' },
    ]);
    expect(state.lastEliminationRound).toBe(3);
  });
});

describe('skipRound', () => {
  it('10. increments the round, leaves players unchanged and records a null elimination', () => {
    const state = start(6);
    const after = unwrap(skipRound(state));
    expect(after.roundNumber).toBe(2);
    expect(after.phase).toBe('playing');
    expect(after.players).toEqual(state.players);
    expect(after.eliminations).toEqual([{ roundNumber: 1, playerId: null }]);
  });

  it('is rejected during reveal', () => {
    const state = start(7);
    const revealed = unwrap(eliminate(state, idsOfRole(state, 'majority')[0]));
    expect(skipRound(revealed)).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
  });
});

describe('nextRound', () => {
  it('11. increments the round and keeps words and roles', () => {
    const state = start(7);
    const revealed = unwrap(eliminate(state, idsOfRole(state, 'majority')[0]));
    const after = unwrap(nextRound(revealed));
    expect(after.roundNumber).toBe(2);
    expect(after.phase).toBe('playing');
    expect(after.majorityWord).toBe(state.majorityWord);
    expect(after.minorityWord).toBe(state.minorityWord);
    expect(
      after.players.map((p) => [p.playerId, p.role, p.secretWord]),
    ).toEqual(state.players.map((p) => [p.playerId, p.role, p.secretWord]));
  });

  it('11. is rejected while playing', () => {
    expect(nextRound(start(6))).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
  });
});

describe('after the game is finished', () => {
  it('12. eliminate, nextRound and skipRound are all rejected', () => {
    const state = start(4);
    const finished = unwrap(eliminate(state, idsOfRole(state, 'minority')[0]));
    expect(finished.phase).toBe('finished');
    const survivor = finished.players.find((p) => !p.eliminated)!.playerId;
    for (const result of [
      eliminate(finished, survivor),
      nextRound(finished),
      skipRound(finished),
    ]) {
      expect(result).toMatchObject({ ok: false, code: 'INVALID_PHASE' });
    }
  });
});

describe('checkWinner and countAlive', () => {
  it('counts alive players per role', () => {
    expect(countAlive(start(11))).toEqual({ majority: 8, minority: 3 });
  });

  it('returns undefined at the start of a game', () => {
    expect(checkWinner(start(15))).toBeUndefined();
  });
});

describe('purity', () => {
  it('does not mutate its input and returns new objects', () => {
    const state = deepFreeze(start(8, 6));
    const snapshot = structuredClone(state);
    const majority = idsOfRole(state, 'majority');

    const eliminated = unwrap(eliminate(state, majority[0]));
    const next = unwrap(nextRound(eliminated));
    const skipped = unwrap(skipRound(next));

    expect(state).toEqual(snapshot);
    expect(eliminated).not.toBe(state);
    expect(eliminated.players).not.toBe(state.players);
    expect(next).not.toBe(eliminated);
    expect(skipped).not.toBe(next);
    expect(countAlive(state)).toEqual({ majority: 6, minority: 2 });
    expect(checkWinner(state)).toBeUndefined();
  });
});
