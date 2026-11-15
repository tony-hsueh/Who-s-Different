import { afterEach, describe, expect, it } from 'vitest';
import type { PublicRoomState } from '../../src/shared/room-types.js';
import {
  aliveOf,
  gameOf,
  must,
  startedGame,
  startServer,
  type Server,
  type TestClient,
} from './helpers.js';

const DEBOUNCE_MS = 80;

let server: Server;
afterEach(async () => {
  await server.close();
});

async function reconnect(token: string) {
  const client = await server.client();
  const authed = must(
    await client.call('player:auth', { sessionToken: token }),
  );
  return { client, ...authed };
}

function publicStates(client: TestClient): PublicRoomState[] {
  return client.received('room:state') as PublicRoomState[];
}

function onlineOf(client: TestClient, playerId: string): boolean | undefined {
  return publicStates(client)
    .at(-1)
    ?.players.find((p) => p.playerId === playerId)?.online;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('player reconnect', () => {
  it('returns the same identity, word and alive status on the same token', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { players, roomId } = await startedGame(server, 4);
    const before = gameOf(server, roomId).players.map((p) => ({ ...p }));
    const player = players[0];
    if (!player) throw new Error('no player');
    const first = must(
      await player.client.call('player:auth', { sessionToken: player.token }),
    );
    player.client.socket.disconnect();

    const again = await reconnect(player.token);

    expect(again.privateState).toStrictEqual(first.privateState);
    expect(again.privateState.playerId).toBe(player.playerId);
    expect(again.privateState.secretWord).not.toBeNull();
    expect(again.state.players).toHaveLength(4);
    expect(gameOf(server, roomId).players).toStrictEqual(before);
    expect(server.store.getRoom(roomId)?.players).toHaveLength(4);
  });

  it('gets the latest round and state after others were eliminated meanwhile', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, players, roomId } = await startedGame(server, 4);
    const away = players[0];
    if (!away) throw new Error('no player');
    away.client.socket.disconnect();

    const victim = gameOf(server, roomId).players.find(
      (p) => p.role === 'majority' && p.playerId !== away.playerId,
    );
    must(
      await host.call('game:eliminate', {
        roundNumber: 1,
        playerId: victim?.playerId ?? '',
      }),
    );
    must(await host.call('game:next-round', {}));

    const again = await reconnect(away.token);

    expect(again.privateState.roundNumber).toBe(2);
    expect(again.privateState.phase).toBe('playing');
    expect(again.state.roundNumber).toBe(2);
    expect(
      again.state.players.find((p) => p.playerId === victim?.playerId),
    ).toMatchObject({ eliminated: true });
  });

  it('keeps an eliminated player eliminated and able to see their word', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, players, roomId } = await startedGame(server, 4);
    const targetId = aliveOf(server, roomId, 'majority');
    const target = players.find((p) => p.playerId === targetId);
    if (!target) throw new Error('no target');
    must(
      await host.call('game:eliminate', {
        roundNumber: 1,
        playerId: targetId,
      }),
    );
    target.client.socket.disconnect();

    const again = await reconnect(target.token);

    expect(again.privateState.eliminated).toBe(true);
    expect(again.privateState.secretWord).toBe(
      gameOf(server, roomId).majorityWord,
    );
  });

  it('lets the same socket authenticate again as the same player', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { players } = await startedGame(server, 4);
    const player = players[0];
    if (!player) throw new Error('no player');

    const res = await player.client.call('player:auth', {
      sessionToken: player.token,
    });

    expect(res).toMatchObject({ ok: true });
  });

  it('still refuses to rebind a socket to another player', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { players } = await startedGame(server, 4);
    const [a, b] = players;
    if (!a || !b) throw new Error('no players');

    const res = await a.client.call('player:auth', { sessionToken: b.token });

    expect(res).toMatchObject({ ok: false, code: 'ALREADY_AUTHENTICATED' });
  });
});

describe('presence in the public state', () => {
  it('lists an offline player with online false and keeps the others online', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, players, roomId } = await startedGame(server, 4);
    const away = players[1];
    if (!away) throw new Error('no player');
    expect(server.store.getRoom(roomId)?.players.every((p) => p.online)).toBe(
      true,
    );

    away.client.socket.disconnect();

    await expect.poll(() => onlineOf(host, away.playerId)).toBe(false);
    const last = publicStates(host).at(-1);
    expect(last?.players).toHaveLength(4);
    expect(last?.players.filter((p) => p.online)).toHaveLength(3);
  });

  it('shows the player online again after a reconnect', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, players } = await startedGame(server, 4);
    const away = players[1];
    if (!away) throw new Error('no player');
    away.client.socket.disconnect();
    await expect.poll(() => onlineOf(host, away.playerId)).toBe(false);

    await reconnect(away.token);

    await expect.poll(() => onlineOf(host, away.playerId)).toBe(true);
  });

  it('does not broadcast a drop shorter than the debounce', async () => {
    server = await startServer({ presenceDebounceMs: 300 });
    const { host, players } = await startedGame(server, 4);
    const away = players[1];
    if (!away) throw new Error('no player');
    const seen = publicStates(host).length;

    away.client.socket.disconnect();
    await wait(50);
    await reconnect(away.token);
    await wait(450);

    const after = publicStates(host).slice(seen);
    expect(after.every((s) => s.players.every((p) => p.online))).toBe(true);
  });

  it('keeps a player online while another of their connections is open', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, players } = await startedGame(server, 4);
    const player = players[1];
    if (!player) throw new Error('no player');
    const second = await reconnect(player.token);

    player.client.socket.disconnect();
    await wait(DEBOUNCE_MS * 4);
    expect(onlineOf(host, player.playerId)).toBe(true);

    second.client.socket.disconnect();
    await expect.poll(() => onlineOf(host, player.playerId)).toBe(false);
  });

  it('puts no secret in what the host receives about an offline player', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, players, roomId } = await startedGame(server, 4);
    const away = players[1];
    if (!away) throw new Error('no player');
    away.client.socket.disconnect();
    await expect.poll(() => onlineOf(host, away.playerId)).toBe(false);

    const game = gameOf(server, roomId);
    const everything = host.everything();
    expect(everything).not.toContain(game.majorityWord);
    expect(everything).not.toContain(game.minorityWord);
    expect(everything).not.toContain(away.token);
  });
});

describe('offline does not change the rules', () => {
  it('lets the offline minority win when the majority is voted down', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, players, roomId } = await startedGame(server, 4);
    const minorityId = aliveOf(server, roomId, 'minority');
    const minority = players.find((p) => p.playerId === minorityId);
    if (!minority) throw new Error('no minority');
    minority.client.socket.disconnect();
    await expect.poll(() => onlineOf(host, minorityId)).toBe(false);

    must(
      await host.call('game:eliminate', {
        roundNumber: 1,
        playerId: aliveOf(server, roomId, 'majority'),
      }),
    );
    must(await host.call('game:next-round', {}));
    must(
      await host.call('game:eliminate', {
        roundNumber: 2,
        playerId: aliveOf(server, roomId, 'majority'),
      }),
    );

    const game = gameOf(server, roomId);
    expect(game.phase).toBe('finished');
    expect(game.winner).toBe('minority');
    expect(
      game.players.find((p) => p.playerId === minorityId)?.eliminated,
    ).toBe(false);
  });

  it('does not eliminate an offline player', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, players, roomId } = await startedGame(server, 4);
    const away = players[2];
    if (!away) throw new Error('no player');
    away.client.socket.disconnect();
    await expect.poll(() => onlineOf(host, away.playerId)).toBe(false);

    const game = gameOf(server, roomId);
    expect(game.players.every((p) => !p.eliminated)).toBe(true);
    expect(game.phase).toBe('playing');
  });
});

describe('host reconnect', () => {
  it('lets the host come back on a new socket and keep eliminating', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, hostToken, players, roomId } = await startedGame(server, 4);
    host.socket.disconnect();
    await wait(DEBOUNCE_MS * 3);
    expect(gameOf(server, roomId).phase).toBe('playing');
    expect(server.store.getRoom(roomId)?.players.every((p) => p.online)).toBe(
      true,
    );
    expect(players).toHaveLength(4);

    const back = await server.client();
    const authed = must(await back.call('host:auth', { hostToken }));
    expect(authed.state.roundNumber).toBe(1);
    must(
      await back.call('game:eliminate', {
        roundNumber: 1,
        playerId: aliveOf(server, roomId, 'majority'),
      }),
    );

    expect(gameOf(server, roomId).eliminations).toHaveLength(1);
  });

  it('accepts a second host connection while the first is open', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { host, hostToken, roomId } = await startedGame(server, 4);
    const second = await server.client();
    must(await second.call('host:auth', { hostToken }));

    host.socket.disconnect();
    await wait(DEBOUNCE_MS * 3);

    must(
      await second.call('game:eliminate', {
        roundNumber: 1,
        playerId: aliveOf(server, roomId, 'majority'),
      }),
    );
  });
});

describe('server restart', () => {
  it('answers ROOM_NOT_FOUND to the old tokens on a fresh app', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const { hostToken, players } = await startedGame(server, 4);
    const playerToken = players[0]?.token ?? '';
    await server.close();

    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const client = await server.client();

    expect(
      await client.call('player:auth', { sessionToken: playerToken }),
    ).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
    expect(await client.call('host:auth', { hostToken })).toMatchObject({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    });
  });

  it('still calls a garbage token INVALID_TOKEN', async () => {
    server = await startServer({ presenceDebounceMs: DEBOUNCE_MS });
    const client = await server.client();
    expect(
      await client.call('player:auth', { sessionToken: 'nope' }),
    ).toMatchObject({ ok: false, code: 'INVALID_TOKEN' });
  });
});
