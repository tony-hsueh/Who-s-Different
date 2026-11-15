import type {
  PlayerPrivateState,
  PublicRoomState,
  RoomErrorCode,
} from './room-types.js';

export type ErrorCode =
  | RoomErrorCode
  | 'FORBIDDEN'
  | 'UNAUTHENTICATED'
  | 'ALREADY_AUTHENTICATED'
  | 'INVALID_PAYLOAD'
  | 'RATE_LIMITED'
  | 'ROUND_MISMATCH'
  | 'INTERNAL_ERROR';

export type AckFailure = { ok: false; code: ErrorCode; message: string };
export type Ack<T> = { ok: true; data: T } | AckFailure;

export type Empty = Record<string, never>;

// One entry per client request: what the client sends and what an ok ack carries.
export interface Requests {
  'room:create': {
    payload: Empty;
    data: { roomId: string; roomCode: string; hostToken: string };
  };
  'host:auth': {
    payload: { hostToken: string };
    data: { state: PublicRoomState };
  };
  'room:join': {
    payload: { roomCode: string; nickname: string };
    data: { playerId: string; sessionToken: string };
  };
  'player:auth': {
    payload: { sessionToken: string };
    data: { state: PublicRoomState; privateState: PlayerPrivateState };
  };
  'room:leave': { payload: Empty; data: null };
  'game:start': { payload: Empty; data: null };
  'game:eliminate': {
    payload: { roundNumber: number; playerId: string };
    data: null;
  };
  'game:skip-round': { payload: { roundNumber: number }; data: null };
  'game:next-round': { payload: Empty; data: null };
  'game:reset': { payload: Empty; data: null };
}

export type ClientToServerEvents = {
  [E in keyof Requests]: (
    payload: Requests[E]['payload'],
    ack: (response: Ack<Requests[E]['data']>) => void,
  ) => void;
};

export interface ServerToClientEvents {
  'room:state': (state: PublicRoomState) => void;
  'game:player-state': (state: PlayerPrivateState) => void;
  'room:closed': (payload: { roomId: string }) => void;
}
