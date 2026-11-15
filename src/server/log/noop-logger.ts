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
  | 'PLAYER_ELIMINATED'
  | 'ROUND_SKIPPED'
  | 'ROUND_STARTED'
  | 'GAME_FINISHED'
  | 'GAME_RESET'
  | 'OPERATION_IGNORED'
  | 'OPERATION_REJECTED'
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

export interface EventLogger {
  logEvent(event: LogEvent): void;
}

export const noopLogger: EventLogger = {
  logEvent() {},
};
