import type { Role } from '../../shared/game-types.js';

export type LogEventType =
  | 'ROOM_CREATED'
  | 'HOST_AUTHENTICATED'
  | 'PLAYER_JOINED'
  | 'PLAYER_AUTHENTICATED'
  | 'PLAYER_LEFT'
  | 'PLAYER_DISCONNECTED'
  | 'PLAYER_RECONNECTED'
  | 'HOST_DISCONNECTED'
  | 'HOST_RECONNECTED'
  | 'GAME_STARTED'
  | 'WORDS_ASSIGNED'
  | 'ELIMINATION_CONFIRMED'
  | 'PLAYER_ELIMINATED'
  | 'ROUND_SKIPPED'
  | 'ROUND_STARTED'
  | 'WIN_CONDITION_MET'
  | 'GAME_FINISHED'
  | 'GAME_RESET'
  | 'OPERATION_IGNORED'
  | 'OPERATION_REJECTED'
  | 'SERVER_ERROR'
  | 'ROOM_CLOSED';

// Never put a secret word, the role of a living player or a token in `payload`.
export type LogEvent = {
  type: LogEventType;
  roomId?: string;
  gameId?: string;
  roundNumber?: number;
  playerId?: string;
  payload: Record<string, unknown>;
};

// Holds the secret words and the role of every player. It goes to a protected
// table, never into a LogEvent.
export type PrivateGameRecord = {
  gameId: string;
  questionPairId: string;
  majorityWord: string;
  minorityWord: string;
  assignments: { playerId: string; role: Role }[];
};

export interface EventLogger {
  logEvent(event: LogEvent): void;
  recordPrivateGame?(record: PrivateGameRecord): void;
}

export const noopLogger: EventLogger = {
  logEvent() {},
};
