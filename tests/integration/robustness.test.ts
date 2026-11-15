import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LogEvent } from '../../src/server/log/noop-logger.js';
import { ROOM_IDLE_TTL_MS } from '../../src/server/rooms/room-store.js';
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

describe('bad input', () => {
  it('rejects malformed payloads and keeps serving', async () => {
    server = await startServer({
      rateLimit: { maxRequests: 1000, windowMs: 1000 },
    });
    const { host, roomId } = await startedGame(server, 4);
    const badEliminations: unknown[] = [
      null,
      42,
      'x',
      [],
      {},
      { roundNumber: '1', playerId: 'a' },
      { roundNumber: 1.5, playerId: 'a' },
      { roundNumber: 1 },
      { roundNumber: 1, playerId: { $ne: 1 } },
    ];
    for (const payload of badEliminations) {
      const res = await host.raw().emitWithAck('game:eliminate', payload);
      expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    }
    const badJoins: unknown[] = [
      null,
      {},
      { roomCode: 1, nickname: 'a' },
      { roomCode: 'ABC' },
    ];
    for (const payload of badJoins) {
      const res = await host.raw().emitWithAck('room:join', payload);
      expect(res).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    }
    const hugeToken = { hostToken: 'x'.repeat(100_000) };
    expect(await host.raw().emitWithAck('host:auth', hugeToken)).toMatchObject({
      ok: false,
      code: 'INVALID_PAYLOAD',
    });

    expect(server.store.getRoom(roomId)?.game?.eliminations).toHaveLength(0);
    expect((await host.call('game:skip-round', { roundNumber: 1 })).ok).toBe(
      true,
    );
  });

  it('survives events sent without an ack callback', async () => {
    server = await startServer();
    const { host, roomId } = await openLobby(server, 4);
    host.raw().emit('game:start');
    host.raw().emit('game:eliminate', null);
    host.raw().emit('room:join', 'junk');
    host.raw().emit('room:create');
    host.raw().emit('not-an-event', { a: 1 });

    await vi.waitFor(() => {
      expect(server.store.getRoom(roomId)?.game).toBeDefined();
    });
    expect((await host.call('game:skip-round', { roundNumber: 1 })).ok).toBe(
      true,
    );
  });

  it('accepts empty-payload events sent with only an ack', async () => {
    server = await startServer();
    const c = await server.client();
    const res = await new Promise<{ ok: boolean }>((resolve) => {
      c.raw().emit('room:create', resolve);
    });
    expect(res.ok).toBe(true);
  });
});

describe('rate limit', () => {
  it('lets 10 requests through per second per socket, then rejects', async () => {
    server = await startServer();
    const c = await server.client();

    const results = await Promise.all(
      Array.from({ length: 12 }, () => c.call('room:create', {})),
    );

    expect(results.filter((r) => r.ok)).toHaveLength(10);
    const limited = results.filter((r) => !r.ok);
    expect(limited).toHaveLength(2);
    for (const r of limited) expect(r).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('allows requests again once the window has passed', async () => {
    server = await startServer();
    const c = await server.client();
    await Promise.all(
      Array.from({ length: 12 }, () => c.call('room:create', {})),
    );

    server.clock.advance(1000);

    expect((await c.call('room:create', {})).ok).toBe(true);
  });

  it('counts each socket on its own', async () => {
    server = await startServer();
    const a = await server.client();
    const b = await server.client();
    await Promise.all(
      Array.from({ length: 12 }, () => a.call('room:create', {})),
    );
    expect((await b.call('room:create', {})).ok).toBe(true);
  });
});

describe('expired rooms', () => {
  it('sweeps idle rooms on a timer and tells everyone in them', async () => {
    server = await startServer({ sweepIntervalMs: 10 });
    const { host, players, roomId, roomCode } = await openLobby(server, 4);

    server.clock.advance(ROOM_IDLE_TTL_MS + 1);

    await vi.waitFor(() => {
      for (const c of [host, ...players.map((p) => p.client)]) {
        expect(c.received('room:closed')).toStrictEqual([{ roomId }]);
      }
    });
    expect(server.store.getRoom(roomId)).toBeUndefined();
    const late = await server.client();
    expect(
      await late.call('room:join', { roomCode, nickname: 'Late' }),
    ).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });
  });

  it('answers ROOM_NOT_FOUND to a host whose room was swept', async () => {
    server = await startServer({ sweepIntervalMs: 10 });
    const { host, roomId } = await openLobby(server, 4);
    server.clock.advance(ROOM_IDLE_TTL_MS + 1);
    await vi.waitFor(() => {
      expect(server.store.getRoom(roomId)).toBeUndefined();
    });
    expect(await host.call('game:start', {})).toMatchObject({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    });
  });

  it('answers ROOM_NOT_FOUND to a player who leaves a swept room', async () => {
    server = await startServer({ sweepIntervalMs: 10 });
    const { players, roomId } = await openLobby(server, 4);
    server.clock.advance(ROOM_IDLE_TTL_MS + 1);
    await vi.waitFor(() => {
      expect(server.store.getRoom(roomId)).toBeUndefined();
    });
    expect(await players[0]?.client.call('room:leave', {})).toMatchObject({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    });
  });

  it('does not close rooms that are still active', async () => {
    server = await startServer({ sweepIntervalMs: 10 });
    const { host, roomId } = await openLobby(server, 4);
    server.clock.advance(ROOM_IDLE_TTL_MS - 1000);
    await new Promise((r) => setTimeout(r, 60));
    expect(host.received('room:closed')).toHaveLength(0);
    expect(server.store.getRoom(roomId)).toBeDefined();
  });
});

describe('event log hook', () => {
  it('reports successes and rejections without secrets or tokens', async () => {
    const events: LogEvent[] = [];
    server = await startServer({
      logger: { logEvent: (e) => events.push(e) },
    });
    const { host, roomId, players } = await startedGame(server, 4);
    must(await host.call('game:skip-round', { roundNumber: 1 }));
    await players[0]?.client.call('game:start', {});
    await host.call('game:eliminate', { roundNumber: 9, playerId: 'x' });

    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'ROOM_CREATED',
        'PLAYER_JOINED',
        'GAME_STARTED',
        'ROUND_SKIPPED',
        'OPERATION_REJECTED',
      ]),
    );
    const rejected = events.filter((e) => e.type === 'OPERATION_REJECTED');
    expect(rejected.map((e) => e.payload.code)).toEqual(
      expect.arrayContaining(['FORBIDDEN', 'ROUND_MISMATCH']),
    );
    expect(events.find((e) => e.type === 'GAME_STARTED')).toMatchObject({
      roomId,
      roundNumber: 1,
    });
    const text = JSON.stringify(events);
    const game = server.store.getRoom(roomId)?.game;
    expect(text).not.toContain(game?.majorityWord ?? 'unreachable');
    expect(text).not.toContain(game?.minorityWord ?? 'unreachable');
    expect(text).not.toMatch(/token/i);
  });

  it('keeps answering when the logger throws', async () => {
    server = await startServer({
      logger: {
        logEvent: () => {
          throw new Error('disk full');
        },
      },
    });
    const c = await server.client();
    expect((await c.call('room:create', {})).ok).toBe(true);
  });
});
