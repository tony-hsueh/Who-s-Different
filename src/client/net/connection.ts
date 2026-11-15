import type {
  Ack,
  AckFailure,
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
// Matches the server's ping interval: a page hidden for less than one heartbeat cannot have
// missed more than one ping, so its connection is still trusted when it comes back.
export const STALE_AFTER_HIDDEN_MS = 10_000;

interface Options {
  socket: SocketLike;
  onError: (code: ErrorCode) => void;
  now?: () => number;
}

export class ConnectionStore {
  private readonly socket: SocketLike;
  private readonly onError: (code: ErrorCode) => void;
  private readonly now: () => number;
  private hiddenAt: number | null = null;
  private readonly listeners = new Set<() => void>();
  private identity: Identity | null = null;
  // Bumped whenever an in-flight auth answer stops being relevant.
  private authRound = 0;
  // The server binds a socket to one identity for its lifetime, so once an auth may
  // have gone out, switching identity needs a fresh connection.
  private mayBeBound = false;
  private readonly pending = new Set<(ack: AckFailure) => void>();
  private snapshot: ConnectionSnapshot;

  constructor({ socket, onError, now = Date.now }: Options) {
    this.socket = socket;
    this.onError = onError;
    this.now = now;
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
    window.addEventListener('online', this.handleOnline);
    document.addEventListener('visibilitychange', this.handleVisibility);
    this.socket.connect();
  }

  stop() {
    this.socket.off('connect', this.handleConnect);
    this.socket.off('disconnect', this.handleDisconnect);
    this.socket.off('room:state', this.handleRoomState);
    this.socket.off('game:player-state', this.handlePlayerState);
    this.socket.off('room:closed', this.handleRoomClosed);
    window.removeEventListener('online', this.handleOnline);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.hiddenAt = null;
    this.socket.disconnect();
  }

  // Drops the current connection and opens a fresh one at once, skipping any backoff wait.
  // The new connection authenticates again with the saved token (see `reauth`), so it is the
  // same identity, not a second one.
  reconnect = () => {
    this.mayBeBound = false;
    this.socket.disconnect();
    this.socket.connect();
  };

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
    if (this.mayBeBound) this.reconnect();
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
    // A closed room stays closed until the page switches to another identity.
    if (this.snapshot.status === 'invalid') return;
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

  // `roomMayBeMissing` is for requests where ROOM_NOT_FOUND is an answer the caller shows
  // itself (a join to a mistyped code), not proof that the page's room is gone.
  request<E extends keyof Requests>(
    event: E,
    payload: Requests[E]['payload'],
    options?: { roomMayBeMissing?: boolean },
  ): Promise<Ack<Requests[E]['data']>> {
    return new Promise((resolve) => {
      // Socket.IO would buffer this and send it before the reconnect handler can authenticate.
      if (!this.socket.connected) {
        resolve(failure('not connected'));
        return;
      }
      const identity = this.identity;
      const settle = (ack: Ack<Requests[E]['data']>) => {
        clearTimeout(timer);
        this.pending.delete(settle);
        resolve(ack);
      };
      const timer = setTimeout(
        () => settle(failure('request timed out')),
        REQUEST_TIMEOUT_MS,
      );
      this.pending.add(settle);
      this.socket.emit(event, payload, (ack) => {
        // The answer may belong to a room the page has already left.
        if (
          !ack.ok &&
          !options?.roomMayBeMissing &&
          ack.code === 'ROOM_NOT_FOUND' &&
          identity &&
          sameIdentity(identity, this.identity)
        ) {
          this.markInvalid(identity);
        }
        settle(ack as Ack<Requests[E]['data']>);
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
        this.onError(ack.code);
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

  // The browser says the network is back. The old connection may be a silent leftover of
  // the previous network, so it is replaced rather than trusted until the heartbeat fails.
  private handleOnline = () => this.reconnect();

  private handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      this.hiddenAt ??= this.now();
      return;
    }
    const hiddenFor = this.hiddenAt === null ? 0 : this.now() - this.hiddenAt;
    this.hiddenAt = null;
    if (!this.socket.connected || hiddenFor > STALE_AFTER_HIDDEN_MS) {
      this.reconnect();
    }
  };

  private handleDisconnect = () => {
    this.mayBeBound = false;
    // Requests still in flight, or held in Socket.IO's buffer while its heartbeat had expired,
    // must not be replayed on the next connection before it authenticates.
    this.socket.sendBuffer.length = 0;
    for (const settle of [...this.pending]) settle(failure('disconnected'));
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

function failure(message: string): AckFailure {
  return { ok: false, code: 'INTERNAL_ERROR', message };
}

function sameIdentity(a: Identity | null, b: Identity | null) {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  return a.kind === 'host'
    ? a.roomId === (b as typeof a).roomId
    : a.roomCode === (b as typeof a).roomCode;
}
