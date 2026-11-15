import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  PlayerPrivateState,
  PublicRoomState,
} from '../../src/shared/room-types.js';
import {
  aliveOf,
  gameOf,
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

function lastPrivate(received: unknown[]): PlayerPrivateState {
  return received.at(-1) as PlayerPrivateState;
}

function lastPublic(received: unknown[]): PublicRoomState {
  return received.at(-1) as PublicRoomState;
}

describe('starting a game', () => {
  it('gives each of 4 players their own private state and only that', async () => {
    server = await startServer();
    const { host, roomId, players } = await openLobby(server, 4);

    must(await host.call('game:start', {}));

    const game = gameOf(server, roomId);
    await vi.waitFor(() => {
      for (const p of players) {
        expect(p.client.received('game:player-state').length).toBeGreaterThan(
          0,
        );
      }
    });
    for (const p of players) {
      const states = p.client.received('game:player-state');
      const latest = lastPrivate(states);
      const truth = game.players.find((g) => g.playerId === p.playerId);
      expect(latest.playerId).toBe(p.playerId);
      expect(latest.secretWord).toBe(truth?.secretWord);
      expect(latest.phase).toBe('playing');
      expect(
        (states as PlayerPrivateState[]).every(
          (s) => s.playerId === p.playerId,
        ),
      ).toBe(true);
      const other = [game.majorityWord, game.minorityWord].find(
        (w) => w !== truth?.secretWord,
      ) as string;
      expect(p.client.everything()).not.toContain(other);
    }
    const words = new Set(
      players.map(
        (p) => lastPrivate(p.client.received('game:player-state')).secretWord,
      ),
    );
    expect(words.size).toBe(2);
  });

  it('is idempotent: a second start is ok and does not deal again', async () => {
    server = await startServer();
    const { host, roomId } = await openLobby(server, 4);
    must(await host.call('game:start', {}));
    const before = gameOf(server, roomId);

    expect((await host.call('game:start', {})).ok).toBe(true);

    expect(gameOf(server, roomId)).toStrictEqual(before);
  });

  it('refuses to start with fewer than 4 players', async () => {
    server = await startServer();
    const { host } = await openLobby(server, 3);
    const res = await host.call('game:start', {});
    expect(res).toMatchObject({ ok: false, code: 'NOT_ENOUGH_PLAYERS' });
  });

  it('refuses a join once the game has started', async () => {
    server = await startServer();
    const { roomCode } = await startedGame(server, 4);
    const late = await server.client();
    const res = await late.call('room:join', { roomCode, nickname: 'Late' });
    expect(res).toMatchObject({ ok: false, code: 'GAME_IN_PROGRESS' });
  });
});

describe('secrecy', () => {
  it('never sends a secret word to the host before the game is finished', async () => {
    server = await startServer();
    const { host, roomId } = await startedGame(server, 4);
    const game = gameOf(server, roomId);
    const words = [game.majorityWord, game.minorityWord];

    must(
      await host.call('game:eliminate', {
        roundNumber: 1,
        playerId: aliveOf(server, roomId, 'majority'),
      }),
    );
    must(await host.call('game:next-round', {}));
    must(await host.call('game:skip-round', { roundNumber: 2 }));
    await vi.waitFor(() => {
      expect(lastPublic(host.received('room:state')).roundNumber).toBe(3);
    });

    expect(gameOf(server, roomId).phase).toBe('playing');
    const everything = host.everything();
    for (const word of words) expect(everything).not.toContain(word);
    expect(host.received('game:player-state')).toHaveLength(0);
  });

  it('keeps roles of living players out of the public state', async () => {
    server = await startServer();
    const { host } = await startedGame(server, 4);
    await vi.waitFor(() => {
      expect(host.received('room:state').length).toBeGreaterThan(0);
    });
    const text = JSON.stringify(host.received('room:state'));
    expect(text).not.toContain('"role"');
    expect(text).not.toContain('secretWord');
  });
});

describe('rounds', () => {
  it('eliminates, reveals, and moves to round 2 on next-round', async () => {
    server = await startServer();
    const { host, roomId } = await startedGame(server, 4);
    const target = aliveOf(server, roomId, 'majority');

    must(
      await host.call('game:eliminate', { roundNumber: 1, playerId: target }),
    );
    expect(gameOf(server, roomId).phase).toBe('reveal');

    must(await host.call('game:next-round', {}));
    expect(gameOf(server, roomId)).toMatchObject({
      phase: 'playing',
      roundNumber: 2,
    });
  });

  it('treats a repeated next-round as already done', async () => {
    server = await startServer();
    const { host, roomId } = await startedGame(server, 4);
    must(
      await host.call('game:eliminate', {
        roundNumber: 1,
        playerId: aliveOf(server, roomId, 'majority'),
      }),
    );
    must(await host.call('game:next-round', {}));

    expect((await host.call('game:next-round', {})).ok).toBe(true);

    expect(gameOf(server, roomId).roundNumber).toBe(2);
  });

  it('lets only one of two simultaneous eliminations through', async () => {
    server = await startServer();
    const { host, roomId } = await startedGame(server, 6);
    const [a, b] = gameOf(server, roomId).players.filter(
      (p) => p.role === 'majority',
    );

    const results = await Promise.all([
      host.call('game:eliminate', {
        roundNumber: 1,
        playerId: a?.playerId ?? '',
      }),
      host.call('game:eliminate', {
        roundNumber: 1,
        playerId: b?.playerId ?? '',
      }),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toHaveLength(1);
    const game = gameOf(server, roomId);
    expect(game.players.filter((p) => p.eliminated)).toHaveLength(1);
    expect(game.eliminations).toHaveLength(1);
  });

  it('rejects an elimination with the wrong roundNumber', async () => {
    server = await startServer();
    const { host, roomId } = await startedGame(server, 4);
    const res = await host.call('game:eliminate', {
      roundNumber: 2,
      playerId: aliveOf(server, roomId, 'majority'),
    });
    expect(res).toMatchObject({ ok: false, code: 'ROUND_MISMATCH' });
    expect(gameOf(server, roomId).phase).toBe('playing');
  });

  it('rejects eliminating someone who is not in the room', async () => {
    server = await startServer();
    const { host } = await startedGame(server, 4);
    const res = await host.call('game:eliminate', {
      roundNumber: 1,
      playerId: 'nobody',
    });
    expect(res).toMatchObject({ ok: false, code: 'PLAYER_NOT_FOUND' });
  });

  it('skips a round: round + 1 and everyone sees the new state', async () => {
    server = await startServer();
    const { host, roomId, players } = await startedGame(server, 4);

    must(await host.call('game:skip-round', { roundNumber: 1 }));

    expect(gameOf(server, roomId)).toMatchObject({
      phase: 'playing',
      roundNumber: 2,
    });
    await vi.waitFor(() => {
      for (const c of [host, ...players.map((p) => p.client)]) {
        expect(lastPublic(c.received('room:state')).roundNumber).toBe(2);
      }
      for (const p of players) {
        expect(
          lastPrivate(p.client.received('game:player-state')).roundNumber,
        ).toBe(2);
      }
    });
  });

  it('rejects a replayed skip-round for an old round', async () => {
    server = await startServer();
    const { host, roomId } = await startedGame(server, 4);
    must(await host.call('game:skip-round', { roundNumber: 1 }));

    const res = await host.call('game:skip-round', { roundNumber: 1 });

    expect(res).toMatchObject({ ok: false, code: 'ROUND_MISMATCH' });
    expect(gameOf(server, roomId).roundNumber).toBe(2);
  });

  it('rejects eliminating after the game is finished', async () => {
    server = await startServer();
    const { host, roomId } = await startedGame(server, 4);
    must(
      await host.call('game:eliminate', {
        roundNumber: 1,
        playerId: aliveOf(server, roomId, 'minority'),
      }),
    );
    expect(gameOf(server, roomId).phase).toBe('finished');

    const res = await host.call('game:eliminate', {
      roundNumber: 1,
      playerId: aliveOf(server, roomId, 'majority'),
    });

    expect(res).toMatchObject({ ok: false, code: 'INVALID_PHASE' });
  });

  it('reveals the words to everyone once finished', async () => {
    server = await startServer();
    const { host, roomId } = await startedGame(server, 4);
    must(
      await host.call('game:eliminate', {
        roundNumber: 1,
        playerId: aliveOf(server, roomId, 'minority'),
      }),
    );
    const game = gameOf(server, roomId);
    await vi.waitFor(() => {
      const last = lastPublic(host.received('room:state'));
      expect(last.result?.majorityWord).toBe(game.majorityWord);
    });
  });
});

describe('playing again', () => {
  it('returns to the lobby, where players can leave and join again', async () => {
    server = await startServer();
    const { host, roomId, roomCode, players } = await startedGame(server, 4);
    must(
      await host.call('game:eliminate', {
        roundNumber: 1,
        playerId: aliveOf(server, roomId, 'minority'),
      }),
    );

    must(await host.call('game:reset', {}));

    expect(server.store.getRoom(roomId)?.game).toBeUndefined();
    await vi.waitFor(() => {
      const last = lastPublic(host.received('room:state'));
      expect(last.phase).toBe('lobby');
      expect(last.players).toHaveLength(4);
    });
    const first = players[0];
    if (!first) throw new Error('no player');
    must(await first.client.call('room:leave', {}));
    await vi.waitFor(() => {
      expect(lastPublic(host.received('room:state')).players).toHaveLength(3);
    });
    const newcomer = await server.client();
    const joined = must(
      await newcomer.call('room:join', { roomCode, nickname: 'New' }),
    );
    must(
      await newcomer.call('player:auth', { sessionToken: joined.sessionToken }),
    );
    await vi.waitFor(() => {
      expect(lastPublic(host.received('room:state')).players).toHaveLength(4);
    });
  });

  it('treats reset in the lobby as already done, and refuses it mid-game', async () => {
    server = await startServer();
    const { host } = await openLobby(server, 4);
    expect((await host.call('game:reset', {})).ok).toBe(true);
    must(await host.call('game:start', {}));
    expect(await host.call('game:reset', {})).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
  });

  it('refuses leaving while a game is on', async () => {
    server = await startServer();
    const { players } = await startedGame(server, 4);
    const first = players[0];
    if (!first) throw new Error('no player');
    expect(await first.client.call('room:leave', {})).toMatchObject({
      ok: false,
      code: 'GAME_IN_PROGRESS',
    });
  });
});
