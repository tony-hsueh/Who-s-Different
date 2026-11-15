import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  eventsForGame,
  openLogDb,
  privateRecordForGame,
  type LogDb,
} from '../../src/server/log/db.js';
import { createSqliteLogger } from '../../src/server/log/logger.js';
import {
  aliveOf,
  gameOf,
  must,
  openLobby,
  startServer,
  type Server,
} from './helpers.js';

let server: Server;
let db: LogDb;
afterEach(async () => {
  await server.close();
  db.close();
});

type Lobby = Awaited<ReturnType<typeof openLobby>>;

async function logged() {
  db = openLogDb(':memory:');
  server = await startServer({
    logger: createSqliteLogger(db),
    admin: { db, token: 'admin-token' },
    rateLimit: { maxRequests: 1000, windowMs: 1000 },
  });
}

async function eliminateMajority(lobby: Lobby, round: number) {
  const playerId = aliveOf(server, lobby.roomId, 'majority');
  must(
    await lobby.host.call('game:eliminate', { roundNumber: round, playerId }),
  );
  return playerId;
}

// 5 players, 1 minority. Round 1 eliminates a majority, round 2 is skipped,
// rounds 3 and 4 eliminate majorities, so the minority wins in round 4.
async function playFullGame(lobby: Lobby) {
  const { host, roomId } = lobby;
  must(await host.call('game:start', {}));
  const gameId = gameOf(server, roomId).gameId;
  const first = await eliminateMajority(lobby, 1);
  must(await host.call('game:next-round', {}));
  must(await host.call('game:skip-round', { roundNumber: 2 }));
  await eliminateMajority(lobby, 3);
  must(await host.call('game:next-round', {}));
  const last = await eliminateMajority(lobby, 4);
  return { gameId, first, last };
}

describe('event log over a full game', () => {
  it('records every step of two games in order, keyed by game id', async () => {
    await logged();
    const lobby = await openLobby(server, 5);
    const one = await playFullGame(lobby);
    must(await lobby.host.call('game:reset', {}));
    must(await lobby.host.call('game:start', {}));
    const two = gameOf(server, lobby.roomId).gameId;
    expect(two).not.toBe(one.gameId);
    const minority = aliveOf(server, lobby.roomId, 'minority');
    must(
      await lobby.host.call('game:eliminate', {
        roundNumber: 1,
        playerId: minority,
      }),
    );

    expect(
      eventsForGame(db, one.gameId).map((e) => [e.eventType, e.roundNumber]),
    ).toEqual([
      ['GAME_STARTED', 1],
      ['WORDS_ASSIGNED', 1],
      ['ROUND_STARTED', 1],
      ['ELIMINATION_CONFIRMED', 1],
      ['PLAYER_ELIMINATED', 1],
      ['ROUND_STARTED', 2],
      ['ROUND_SKIPPED', 2],
      ['ROUND_STARTED', 3],
      ['ELIMINATION_CONFIRMED', 3],
      ['PLAYER_ELIMINATED', 3],
      ['ROUND_STARTED', 4],
      ['ELIMINATION_CONFIRMED', 4],
      ['PLAYER_ELIMINATED', 4],
      ['WIN_CONDITION_MET', 4],
      ['GAME_FINISHED', 4],
      ['GAME_RESET', 4],
    ]);
    expect(eventsForGame(db, two).map((e) => e.eventType)).toEqual([
      'GAME_STARTED',
      'WORDS_ASSIGNED',
      'ROUND_STARTED',
      'ELIMINATION_CONFIRMED',
      'PLAYER_ELIMINATED',
      'WIN_CONDITION_MET',
      'GAME_FINISHED',
    ]);
  });

  it('writes a complete elimination payload', async () => {
    await logged();
    const lobby = await openLobby(server, 5);
    const game = await playFullGame(lobby);
    const events = eventsForGame(db, game.gameId);
    const eliminated = events.filter(
      (e) => e.eventType === 'PLAYER_ELIMINATED',
    );
    expect(eliminated[0]).toMatchObject({
      playerId: game.first,
      payload: {
        gameId: game.gameId,
        round: 1,
        eliminatedPlayerId: game.first,
        role: 'majority',
        remaining: { majority: 3, minority: 1 },
        winReached: false,
      },
    });
    expect(eliminated[2]?.payload).toEqual({
      gameId: game.gameId,
      round: 4,
      eliminatedPlayerId: game.last,
      role: 'majority',
      remaining: { majority: 1, minority: 1 },
      winReached: true,
      winner: 'minority',
    });
    expect(
      events.find((e) => e.eventType === 'WORDS_ASSIGNED')?.payload,
    ).toEqual({ questionPairId: expect.any(String), playerCount: 5 });
  });

  it('keeps tokens and secret words out of every ordinary log row', async () => {
    await logged();
    const lobby = await openLobby(server, 5);
    const game = await playFullGame(lobby);
    await lobby.players[0]?.client.call('game:eliminate', {
      roundNumber: 4,
      playerId: game.first,
    });
    const state = gameOf(server, lobby.roomId);
    const hostTokens = lobby.host.frames
      .filter((f) => f.event === 'ack:room:create')
      .map((f) => (f.data as { data: { hostToken: string } }).data.hostToken);
    const secrets = [
      state.majorityWord,
      state.minorityWord,
      ...lobby.players.map((p) => p.token),
      ...hostTokens,
    ];
    expect(secrets.every((s) => s.length > 0)).toBe(true);

    const rows = JSON.stringify(db.prepare('SELECT * FROM game_events').all());
    for (const secret of secrets) expect(rows).not.toContain(secret);
    expect(rows).not.toMatch(/token/i);
  });

  it('keeps the words and role assignment in the private record', async () => {
    await logged();
    const lobby = await openLobby(server, 5);
    const game = await playFullGame(lobby);
    const state = gameOf(server, lobby.roomId);
    expect(privateRecordForGame(db, game.gameId)).toMatchObject({
      gameId: game.gameId,
      questionPairId: state.questionPairId,
      majorityWord: state.majorityWord,
      minorityWord: state.minorityWord,
      assignments: state.players.map((p) => ({
        playerId: p.playerId,
        role: p.role,
      })),
    });
  });

  it('logs OPERATION_REJECTED when a player tries to eliminate', async () => {
    await logged();
    const lobby = await openLobby(server, 5);
    must(await lobby.host.call('game:start', {}));
    const player = lobby.players[0]!;
    const res = await player.client.call('game:eliminate', {
      roundNumber: 1,
      playerId: lobby.players[1]!.playerId,
    });
    expect(res).toMatchObject({ ok: false, code: 'FORBIDDEN' });

    const rejected = db
      .prepare(
        "SELECT * FROM game_events WHERE event_type = 'OPERATION_REJECTED'",
      )
      .all() as { room_id: string; player_id: string; payload: string }[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      room_id: lobby.roomId,
      game_id: gameOf(server, lobby.roomId).gameId,
      round_number: 1,
      player_id: player.playerId,
    });
    expect(JSON.parse(rejected[0]!.payload)).toEqual({
      event: 'game:eliminate',
      code: 'FORBIDDEN',
    });
  });

  it('serves the events over the admin endpoint, with the token only', async () => {
    await logged();
    const lobby = await openLobby(server, 5);
    const game = await playFullGame(lobby);
    const url = `/admin/games/${game.gameId}/events`;
    const res = await request(server.app.httpServer)
      .get(url)
      .set('Authorization', 'Bearer admin-token');
    expect(res.status).toBe(200);
    expect(
      res.body.events.map((e: { eventType: string }) => e.eventType),
    ).toContain('WIN_CONDITION_MET');
    const state = gameOf(server, lobby.roomId);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(state.majorityWord);
    expect(text).not.toContain(state.minorityWord);

    expect((await request(server.app.httpServer).get(url)).status).toBe(401);
  });
});
