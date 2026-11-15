import type {
  Ack,
  ErrorCode,
  PlayerPrivateState,
  PublicRoomState,
  Requests,
} from '../../shared';
import {
  clearHostToken,
  clearPlayerToken,
  readHostToken,
  readPlayerToken,
} from './session-storage';
import type { SocketLike } from './socket';

export type Identity =
  { kind: 'host'; roomId: string } | { kind: 'player'; roomCode: string };

export type ConnectionStatus =
  | 'idle' // no identity registered
  | 'connecting' // waiting for the socket
  | 'authenticating'
  | 'ready'
  | 'no-token' // nothing saved, or the saved token was rejected
  | 'invalid'; // the room is gone

export interface ConnectionSnapshot {
  connected: boolean;
  status: ConnectionStatus;
  roomState: PublicRoomState | null;
  playerState: PlayerPrivateState | null;
}

export const REQUEST_TIMEOUT_MS = 10_000;

interface Options {
  socket: SocketLike;
  onError: (code: ErrorCode) => void;
}

export class ConnectionStore {
  private readonly socket: SocketLike;
  private readonly onError: (code: ErrorCode) => void;
  private readonly listeners = new Set<() => void>();
  private identity: Identity | null = null;
  // Bumped whenever an in-flight auth answer stops being relevant.
  private authRound = 0;
  // The server binds a socket to one identity for its lifetime, so once an auth may
  // have gone out, switching identity needs a fresh connection.
  private mayBeBound = false;
  private snapshot: ConnectionSnapshot;

  constructor({ socket, onError }: Options) {
    this.socket = socket;
    this.onError = onError;
    this.snapshot = {
      connected: socket.connected,
      status: 'idle',
      roomState: null,
      playerState: null,
    };
  }

  start() {
    this.socket.on('connect', this.handleConnect);
    this.socket.on('disconnect', this.handleDisconnect);
    this.socket.on('room:state', this.handleRoomState);
    this.socket.on('game:player-state', this.handlePlayerState);
    this.socket.on('room:closed', this.handleRoomClosed);
    this.socket.connect();
  }

  stop() {
    this.socket.off('connect', this.handleConnect);
    this.socket.off('disconnect', this.handleDisconnect);
    this.socket.off('room:state', this.handleRoomState);
    this.socket.off('game:player-state', this.handlePlayerState);
    this.socket.off('room:closed', this.handleRoomClosed);
    this.socket.disconnect();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  setIdentity(identity: Identity | null) {
    if (sameIdentity(this.identity, identity)) return;
    this.identity = identity;
    this.authRound++;
    if (this.mayBeBound) this.rebind();
    this.update({
      roomState: null,
      playerState: null,
      status: identity ? 'connecting' : 'idle',
    });
    this.reauth();
  }

  // Runs on every (re)connect, and after a join or create saved a fresh token.
  reauth = () => {
    const identity = this.identity;
    if (!identity || !this.socket.connected) return;
    const round = ++this.authRound;
    const token =
      identity.kind === 'host'
        ? readHostToken(identity.roomId)
        : readPlayerToken(identity.roomCode);
    if (!token) {
      this.update({ status: 'no-token' });
      return;
    }
    this.update({ status: 'authenticating' });
    this.mayBeBound = true;
    const onAck = (ack: Ack<unknown>) => {
      if (round === this.authRound) this.handleAuthAck(identity, ack);
    };
    if (identity.kind === 'host') {
      this.socket.emit('host:auth', { hostToken: token }, onAck);
    } else {
      this.socket.emit('player:auth', { sessionToken: token }, onAck);
    }
  };

  request<E extends keyof Requests>(
    event: E,
    payload: Requests[E]['payload'],
  ): Promise<Ack<Requests[E]['data']>> {
    return new Promise((resolve) => {
      // Socket.IO would buffer this and send it before the reconnect handler can authenticate.
      if (!this.socket.connected) {
        resolve({
          ok: false,
          code: 'INTERNAL_ERROR',
          message: 'not connected',
        });
        return;
      }
      const timer = setTimeout(() => {
        resolve({
          ok: false,
          code: 'INTERNAL_ERROR',
          message: 'request timed out',
        });
      }, REQUEST_TIMEOUT_MS);
      this.socket.emit(event, payload, (ack) => {
        clearTimeout(timer);
        resolve(ack as Ack<Requests[E]['data']>);
      });
    });
  }

  private handleAuthAck(identity: Identity, ack: Ack<unknown>) {
    if (ack.ok) {
      if (identity.kind === 'host') {
        const data = ack.data as Requests['host:auth']['data'];
        this.update({ status: 'ready', roomState: data.state });
      } else {
        const data = ack.data as Requests['player:auth']['data'];
        this.update({
          status: 'ready',
          roomState: data.state,
          playerState: data.privateState,
        });
      }
      return;
    }
    switch (ack.code) {
      case 'ALREADY_AUTHENTICATED':
        this.update({ status: 'ready' });
        return;
      case 'ROOM_NOT_FOUND':
        this.markInvalid(identity);
        return;
      case 'INVALID_TOKEN':
      case 'TOKEN_EXPIRED':
        this.clearToken(identity);
        this.update({ status: 'no-token' });
        return;
      default:
        this.onError(ack.code);
        this.update({ status: 'connecting' });
    }
  }

  private markInvalid(identity: Identity) {
    this.clearToken(identity);
    this.authRound++;
    this.update({ status: 'invalid', roomState: null, playerState: null });
  }

  private clearToken(identity: Identity) {
    if (identity.kind === 'host') clearHostToken(identity.roomId);
    else clearPlayerToken(identity.roomCode);
  }

  private handleConnect = () => {
    this.update({ connected: true });
    this.reauth();
  };

  private rebind() {
    this.mayBeBound = false;
    this.socket.disconnect();
    this.socket.connect();
  }

  private handleDisconnect = () => {
    this.mayBeBound = false;
    const waiting =
      this.snapshot.status === 'ready' ||
      this.snapshot.status === 'authenticating';
    this.update({
      connected: false,
      ...(waiting ? { status: 'connecting' as const } : {}),
    });
  };

  private handleRoomState = (roomState: PublicRoomState) => {
    this.update({ roomState });
  };

  private handlePlayerState = (playerState: PlayerPrivateState) => {
    this.update({ playerState });
  };

  private handleRoomClosed = ({ roomId }: { roomId: string }) => {
    const identity = this.identity;
    if (!identity) return;
    const mine =
      identity.kind === 'host'
        ? identity.roomId === roomId
        : this.snapshot.roomState?.roomId === roomId;
    if (mine) this.markInvalid(identity);
  };

  private update(patch: Partial<ConnectionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of [...this.listeners]) listener();
  }
}

function sameIdentity(a: Identity | null, b: Identity | null) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'host'
    ? a.roomId === (b as typeof a).roomId
    : a.roomCode === (b as typeof a).roomCode;
}
