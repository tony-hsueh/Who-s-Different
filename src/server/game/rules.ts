import type {
  GamePlayer,
  GameState,
  Role,
  RuleErrorCode,
  RuleResult,
  WordPair,
} from '../../shared/game-types.js';
import { shuffle, type Rng } from './random.js';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 15;

export function minorityCountFor(playerCount: number): number {
  if (
    !Number.isInteger(playerCount) ||
    playerCount < MIN_PLAYERS ||
    playerCount > MAX_PLAYERS
  ) {
    throw new RangeError(
      `Player count must be an integer from ${MIN_PLAYERS} to ${MAX_PLAYERS}, got ${playerCount}`,
    );
  }
  if (playerCount <= 6) return 1;
  if (playerCount <= 10) return 2;
  return 3;
}

function fail(code: RuleErrorCode, message: string): RuleResult {
  return { ok: false, code, message };
}

export function createGame(params: {
  playerIds: readonly string[];
  pair: WordPair;
  rng: Rng;
  gameId: string;
}): RuleResult {
  const { playerIds, pair, rng, gameId } = params;
  if (playerIds.length < MIN_PLAYERS || playerIds.length > MAX_PLAYERS) {
    return fail(
      'INVALID_PLAYER_COUNT',
      `Need ${MIN_PLAYERS} to ${MAX_PLAYERS} players, got ${playerIds.length}`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    return fail('DUPLICATE_PLAYER', 'Player ids must be unique');
  }

  const [majorityWord, minorityWord] =
    rng() < 0.5 ? [pair.wordA, pair.wordB] : [pair.wordB, pair.wordA];
  const minorityIds = new Set(
    shuffle(playerIds, rng).slice(0, minorityCountFor(playerIds.length)),
  );
  const players: GamePlayer[] = playerIds.map((playerId) => {
    const role: Role = minorityIds.has(playerId) ? 'minority' : 'majority';
    return {
      playerId,
      role,
      secretWord: role === 'majority' ? majorityWord : minorityWord,
      eliminated: false,
    };
  });

  return {
    ok: true,
    state: {
      gameId,
      phase: 'playing',
      roundNumber: 1,
      questionPairId: pair.id,
      majorityWord,
      minorityWord,
      players,
      eliminations: [],
    },
  };
}

export function countAlive(state: GameState): Record<Role, number> {
  const alive = { majority: 0, minority: 0 };
  for (const p of state.players) if (!p.eliminated) alive[p.role]++;
  return alive;
}

export function checkWinner(state: GameState): Role | undefined {
  const { majority, minority } = countAlive(state);
  if (minority === 0) return 'majority';
  if (minority >= majority) return 'minority';
  return undefined;
}

function invalidPhase(state: GameState, expected: string): RuleResult {
  return fail(
    'INVALID_PHASE',
    `Expected phase ${expected}, but game is in ${state.phase}`,
  );
}

export function eliminate(state: GameState, playerId: string): RuleResult {
  if (state.phase !== 'playing') return invalidPhase(state, 'playing');
  const target = state.players.find((p) => p.playerId === playerId);
  if (!target) return fail('PLAYER_NOT_FOUND', `Unknown player ${playerId}`);
  if (target.eliminated) {
    return fail('ALREADY_ELIMINATED', `Player ${playerId} is already out`);
  }

  const players = state.players.map((p) =>
    p.playerId === playerId
      ? { ...p, eliminated: true, eliminatedInRound: state.roundNumber }
      : p,
  );
  const updated: GameState = {
    ...state,
    players,
    eliminations: [
      ...state.eliminations,
      { roundNumber: state.roundNumber, playerId, role: target.role },
    ],
    lastEliminationRound: state.roundNumber,
  };
  const winner = checkWinner(updated);
  return {
    ok: true,
    state: winner
      ? { ...updated, phase: 'finished', winner }
      : { ...updated, phase: 'reveal' },
  };
}

export function skipRound(state: GameState): RuleResult {
  if (state.phase !== 'playing') return invalidPhase(state, 'playing');
  return {
    ok: true,
    state: {
      ...state,
      players: state.players.map((p) => ({ ...p })),
      eliminations: [
        ...state.eliminations,
        { roundNumber: state.roundNumber, playerId: null },
      ],
      roundNumber: state.roundNumber + 1,
    },
  };
}

export function nextRound(state: GameState): RuleResult {
  if (state.phase !== 'reveal') return invalidPhase(state, 'reveal');
  return {
    ok: true,
    state: {
      ...state,
      players: state.players.map((p) => ({ ...p })),
      eliminations: [...state.eliminations],
      roundNumber: state.roundNumber + 1,
      phase: 'playing',
    },
  };
}
