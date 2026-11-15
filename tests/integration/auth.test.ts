import { afterEach, describe, expect, it } from 'vitest';
import {
  must,
  openLobby,
  startedGame,
  startServer,
  type Server,
} from './helpers.js';

let server: Server;
afterEach(async () => {
  await server.close();
});

describe('permissions', () => {
  it('rejects a player who tries to start, eliminate or reset', async () => {
    server = await startServer();
    const { players, roomId } = await startedGame(server, 4);
    const player = players[0];
    if (!player) throw new Error('no player');
    const target = players[1]?.playerId ?? '';

    const results = [
      await player.client.call('game:start', {}),
      await player.client.call('game:eliminate', {
        roundNumber: 1,
        playerId: target,
      }),
      await player.client.call('game:skip-round', { roundNumber: 1 }),
      await player.client.call('game:next-round', {}),
      await player.client.call('game:reset', {}),
    ];

    for (const res of results) {
      expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });
    }
    expect(server.store.getRoom(roomId)?.game?.eliminations).toHaveLength(0);
  });

  it('rejects the host when it tries to leave as a player', async () => {
    server = await startServer();
    const { host } = await openLobby(server, 4);
    expect(await host.call('room:leave', {})).toMatchObject({
      ok: false,
      code: 'FORBIDDEN',
    });
  });

  it('rejects game operations from a socket that never authenticated', async () => {
    server = await startServer();
    const stranger = await server.client();
    for (const res of [
      await stranger.call('game:start', {}),
      await stranger.call('game:reset', {}),
      await stranger.call('room:leave', {}),
    ]) {
      expect(res).toMatchObject({ ok: false, code: 'UNAUTHENTICATED' });
    }
  });

  it('keeps a host out of other rooms', async () => {
    server = await startServer();
    const a = await openLobby(server, 4);
    const b = await openLobby(server, 4);
    must(await a.host.call('game:start', {}));
    must(await b.host.call('game:start', {}));

    const res = await b.host.call('game:eliminate', {
      roundNumber: 1,
      playerId: a.players[0]?.playerId ?? '',
    });

    expect(res).toMatchObject({ ok: false, code: 'PLAYER_NOT_FOUND' });
    expect(server.store.getRoom(a.roomId)?.game?.eliminations).toHaveLength(0);
  });
});

describe('binding', () => {
  it('rejects unknown tokens', async () => {
    server = await startServer();
    const c = await server.client();
    expect(await c.call('host:auth', { hostToken: 'nope' })).toMatchObject({
      ok: false,
      code: 'INVALID_TOKEN',
    });
    expect(await c.call('player:auth', { sessionToken: 'nope' })).toMatchObject(
      { ok: false, code: 'INVALID_TOKEN' },
    );
  });

  it('does not accept a host token as a session token or the reverse', async () => {
    server = await startServer();
    const host = await server.client();
    const created = must(await host.call('room:create', {}));
    const player = await server.client();
    const joined = must(
      await player.call('room:join', {
        roomCode: created.roomCode,
        nickname: 'A',
      }),
    );
    const c = await server.client();
    expect(
      await c.call('player:auth', { sessionToken: created.hostToken }),
    ).toMatchObject({ ok: false, code: 'INVALID_TOKEN' });
    expect(
      await c.call('host:auth', { hostToken: joined.sessionToken }),
    ).toMatchObject({ ok: false, code: 'INVALID_TOKEN' });
  });

  it('answers host:auth with the public state and player:auth with both states', async () => {
    server = await startServer();
    const host = await server.client();
    const created = must(await host.call('room:create', {}));
    const hostState = must(
      await host.call('host:auth', { hostToken: created.hostToken }),
    );
    expect(hostState.state).toMatchObject({
      roomId: created.roomId,
      roomCode: created.roomCode,
      phase: 'lobby',
    });

    const player = await server.client();
    const joined = must(
      await player.call('room:join', {
        roomCode: created.roomCode,
        nickname: 'A',
      }),
    );
    const authed = must(
      await player.call('player:auth', { sessionToken: joined.sessionToken }),
    );
    expect(authed.state.players).toHaveLength(1);
    expect(authed.privateState).toMatchObject({
      playerId: joined.playerId,
      secretWord: null,
    });
  });

  it('refuses to bind a socket twice', async () => {
    server = await startServer();
    const { host } = await openLobby(server, 4);
    const created = must(await host.call('room:create', {}));
    expect(
      await host.call('host:auth', { hostToken: created.hostToken }),
    ).toMatchObject({ ok: false, code: 'ALREADY_AUTHENTICATED' });
  });

  it('never puts a token in the connection URL', async () => {
    server = await startServer();
    const { host } = await openLobby(server, 4);
    expect(host.socket.io.opts.query ?? {}).toStrictEqual({});
  });
});

describe('unknown rooms', () => {
  it('answers ROOM_NOT_FOUND for a code nobody has', async () => {
    server = await startServer();
    const c = await server.client();
    expect(
      await c.call('room:join', { roomCode: 'ZZZZZZ', nickname: 'A' }),
    ).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
  });
});
