import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type {
  ErrorCode,
  PlayerPrivateState,
  PublicRoomState,
} from '../../shared';
import { ConnectionStore } from './connection';
import { MockSocket } from './mock-socket';
import {
  readHostToken,
  readPlayerToken,
  saveHostToken,
  savePlayerToken,
} from './session-storage';
import { socketOptions } from './socket';

const roomState: PublicRoomState = {
  roomId: 'r1',
  roomCode: 'ABCD',
  phase: 'lobby',
  roundNumber: 0,
  players: [],
};
const privateState: PlayerPrivateState = {
  playerId: 'p1',
  phase: 'lobby',
  roundNumber: 0,
  secretWord: null,
  eliminated: false,
};

let socket: MockSocket;
let onError: Mock<(code: ErrorCode) => void>;
let store: ConnectionStore;

beforeEach(() => {
  localStorage.clear();
  socket = new MockSocket();
  onError = vi.fn<(code: ErrorCode) => void>();
  store = new ConnectionStore({ socket, onError });
  store.start();
});

afterEach(() => {
  store.stop();
  vi.useRealTimers();
});

const ok = <T>(data: T) => ({ ok: true as const, data });
const fail = (code: string) => ({
  ok: false as const,
  code: code as never,
  message: 'x',
});

describe('host identity', () => {
  beforeEach(() => saveHostToken('r1', 'host-token'));

  it('authenticates with the saved token as soon as the socket connects', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    expect(socket.requestsFor('host:auth')).toHaveLength(0);
    socket.serverConnect();
    expect(socket.requestsFor('host:auth')[0]?.payload).toStrictEqual({
      hostToken: 'host-token',
    });
    expect(store.getSnapshot().status).toBe('authenticating');
    socket.answer('host:auth', ok({ state: roomState }));
    expect(store.getSnapshot().status).toBe('ready');
    expect(store.getSnapshot().roomState).toStrictEqual(roomState);
  });

  it('authenticates immediately when the socket is already connected', () => {
    socket.serverConnect();
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    expect(socket.requestsFor('host:auth')).toHaveLength(1);
  });

  it('re-authenticates on every reconnect', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    socket.serverConnect();
    socket.answer('host:auth', ok({ state: roomState }));
    socket.serverDisconnect();
    expect(store.getSnapshot().connected).toBe(false);
    expect(store.getSnapshot().status).toBe('connecting');
    expect(store.getSnapshot().roomState).toStrictEqual(roomState);
    socket.serverConnect();
    expect(socket.requestsFor('host:auth')).toHaveLength(2);
    socket.answer('host:auth', ok({ state: { ...roomState, roundNumber: 1 } }));
    expect(store.getSnapshot().status).toBe('ready');
    expect(store.getSnapshot().roomState?.roundNumber).toBe(1);
  });

  it('follows room:state broadcasts', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    socket.serverConnect();
    socket.answer('host:auth', ok({ state: roomState }));
    socket.serverEmit('room:state', { ...roomState, phase: 'playing' });
    expect(store.getSnapshot().roomState?.phase).toBe('playing');
  });

  it('treats ALREADY_AUTHENTICATED as success without an error toast', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    socket.serverConnect();
    socket.answer('host:auth', fail('ALREADY_AUTHENTICATED'));
    expect(store.getSnapshot().status).toBe('ready');
    expect(onError).not.toHaveBeenCalled();
    expect(readHostToken('r1')).toBe('host-token');
  });

  it('clears the token and reports invalid on ROOM_NOT_FOUND', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    socket.serverConnect();
    socket.answer('host:auth', fail('ROOM_NOT_FOUND'));
    expect(store.getSnapshot().status).toBe('invalid');
    expect(readHostToken('r1')).toBeNull();
  });

  it('clears the token and reports invalid on room:closed', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    socket.serverConnect();
    socket.answer('host:auth', ok({ state: roomState }));
    socket.serverEmit('room:closed', { roomId: 'r1' });
    expect(store.getSnapshot().status).toBe('invalid');
    expect(store.getSnapshot().roomState).toBeNull();
    expect(readHostToken('r1')).toBeNull();
  });

  it('ignores room:closed for another room', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    socket.serverConnect();
    socket.answer('host:auth', ok({ state: roomState }));
    socket.serverEmit('room:closed', { roomId: 'other' });
    expect(store.getSnapshot().status).toBe('ready');
    expect(readHostToken('r1')).toBe('host-token');
  });

  it('drops a rejected token and asks for a new login', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    socket.serverConnect();
    socket.answer('host:auth', fail('TOKEN_EXPIRED'));
    expect(store.getSnapshot().status).toBe('no-token');
    expect(readHostToken('r1')).toBeNull();
  });

  it('reports other errors through onError and keeps the token', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    socket.serverConnect();
    socket.answer('host:auth', fail('RATE_LIMITED'));
    expect(onError).toHaveBeenCalledWith('RATE_LIMITED');
    expect(readHostToken('r1')).toBe('host-token');
  });

  it('ignores an auth answer that arrives after the identity changed', () => {
    store.setIdentity({ kind: 'host', roomId: 'r1' });
    socket.serverConnect();
    store.setIdentity(null);
    socket.answer('host:auth', ok({ state: roomState }));
    expect(store.getSnapshot().roomState).toBeNull();
    expect(store.getSnapshot().status).toBe('idle');
  });
});

describe('player identity', () => {
  it('sends player:auth and keeps both states', () => {
    savePlayerToken('ABCD', 'player-token');
    store.setIdentity({ kind: 'player', roomCode: 'abcd' });
    socket.serverConnect();
    expect(socket.requestsFor('player:auth')[0]?.payload).toStrictEqual({
      sessionToken: 'player-token',
    });
    socket.answer('player:auth', ok({ state: roomState, privateState }));
    expect(store.getSnapshot().status).toBe('ready');
    expect(store.getSnapshot().roomState).toStrictEqual(roomState);
    expect(store.getSnapshot().playerState).toStrictEqual(privateState);
    socket.serverEmit('game:player-state', {
      ...privateState,
      phase: 'playing',
    });
    expect(store.getSnapshot().playerState?.phase).toBe('playing');
  });

  it('reports no-token without calling the server when nothing is saved', () => {
    store.setIdentity({ kind: 'player', roomCode: 'ABCD' });
    socket.serverConnect();
    expect(socket.sent).toHaveLength(0);
    expect(store.getSnapshot().status).toBe('no-token');
  });

  it('can authenticate again after a join saved a token', () => {
    store.setIdentity({ kind: 'player', roomCode: 'ABCD' });
    socket.serverConnect();
    savePlayerToken('ABCD', 'fresh');
    store.reauth();
    expect(socket.requestsFor('player:auth')[0]?.payload).toStrictEqual({
      sessionToken: 'fresh',
    });
  });

  it('clears the player token on ROOM_NOT_FOUND', () => {
    savePlayerToken('ABCD', 'player-token');
    store.setIdentity({ kind: 'player', roomCode: 'ABCD' });
    socket.serverConnect();
    socket.answer('player:auth', fail('ROOM_NOT_FOUND'));
    expect(store.getSnapshot().status).toBe('invalid');
    expect(readPlayerToken('ABCD')).toBeNull();
  });
});

describe('request', () => {
  it('resolves with the server ack', async () => {
    const promise = store.request('game:start', {});
    socket.answer('game:start', ok(null));
    expect(await promise).toStrictEqual(ok(null));
    expect(socket.requestsFor('game:start')[0]?.payload).toStrictEqual({});
  });

  it('gives up with INTERNAL_ERROR when the server never answers', async () => {
    vi.useFakeTimers();
    const promise = store.request('game:start', {});
    await vi.advanceTimersByTimeAsync(15_000);
    expect(await promise).toMatchObject({ ok: false, code: 'INTERNAL_ERROR' });
  });
});

describe('socketOptions', () => {
  it('reconnects with exponential backoff', () => {
    expect(socketOptions.reconnection).toBe(true);
    expect(socketOptions.reconnectionAttempts).toBe(Infinity);
    expect(socketOptions.reconnectionDelayMax).toBeGreaterThan(
      (socketOptions.reconnectionDelay ?? 0) * 2,
    );
  });
});
