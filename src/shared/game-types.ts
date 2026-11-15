export type Role = 'majority' | 'minority';

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 15;

export type GamePhase = 'lobby' | 'playing' | 'reveal' | 'finished';

export type GamePlayer = {
  playerId: string;
  role: Role;
  secretWord: string;
  eliminated: boolean;
  eliminatedInRound?: number;
};

export type EliminationRecord = {
  roundNumber: number;
  playerId: string | null;
  role?: Role;
};

export type GameState = {
  gameId: string;
  phase: Exclude<GamePhase, 'lobby'>;
  roundNumber: number;
  questionPairId: string;
  majorityWord: string;
  minorityWord: string;
  players: GamePlayer[];
  eliminations: EliminationRecord[];
  winner?: Role;
  lastEliminationRound?: number;
};

export type WordPair = { id: string; wordA: string; wordB: string };

export type RuleErrorCode =
  | 'INVALID_PHASE'
  | 'PLAYER_NOT_FOUND'
  | 'ALREADY_ELIMINATED'
  | 'INVALID_PLAYER_COUNT'
  | 'DUPLICATE_PLAYER';

export type RuleResult =
  | { ok: true; state: GameState }
  | { ok: false; code: RuleErrorCode; message: string };
