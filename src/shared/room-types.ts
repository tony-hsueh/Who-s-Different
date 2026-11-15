import type {
  EliminationRecord,
  GamePhase,
  Role,
  RuleErrorCode,
} from './game-types.js';

export type RoomErrorCode =
  | 'NICKNAME_EMPTY'
  | 'NICKNAME_TOO_LONG'
  | 'NICKNAME_TAKEN'
  | 'ROOM_FULL'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_CODE_UNAVAILABLE'
  | 'PLAYER_NOT_FOUND'
  | 'GAME_IN_PROGRESS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'INVALID_PHASE'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | RuleErrorCode;

export type RoomFailure = {
  ok: false;
  code: RoomErrorCode;
  message: string;
};

export const NICKNAME_MAX_LENGTH = 12;

export type PublicPlayer = {
  playerId: string;
  nickname: string;
  avatarColor: string;
  avatarIndex: number;
  eliminated: boolean;
  online: boolean;
};

export type PublicElimination = {
  roundNumber: number;
  playerId: string;
  role: Role;
};

export type PublicGameResult = {
  winner: Role;
  majorityWord: string;
  minorityWord: string;
  players: { playerId: string; role: Role }[];
  eliminations: EliminationRecord[];
};

export type PublicRoomState = {
  roomId: string;
  roomCode: string;
  phase: GamePhase;
  roundNumber: number;
  players: PublicPlayer[];
  lastElimination?: PublicElimination;
  result?: PublicGameResult;
};

export type PlayerPrivateState = {
  playerId: string;
  phase: GamePhase;
  roundNumber: number;
  secretWord: string | null;
  eliminated: boolean;
};
