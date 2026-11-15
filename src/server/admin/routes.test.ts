import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { openLogDb, type LogDb } from '../log/db.js';
import { createSqliteLogger } from '../log/logger.js';

let db: LogDb;
afterEach(() => {
  db.close();
});

function setup(token: string | undefined, clientDir?: string) {
  db = openLogDb(':memory:');
  createSqliteLogger(db).logEvent({
    type: 'GAME_STARTED',
    roomId: 'r1',
    gameId: 'g1',
    payload: { playerCount: 4 },
  });
  const { app } = createApp({
    admin: token ? { db, token } : undefined,
    clientDir,
  });
  return app;
}

describe('GET /admin/games/:gameId/events', () => {
  it('is disabled with 404 when no admin token is configured', async () => {
    const app = setup(undefined);
    const res = await request(app)
      .get('/admin/games/g1/events')
      .set('Authorization', 'Bearer anything');
    expect(res.status).toBe(404);
  });

  it('stays 404 when the SPA fallback is served', async () => {
    const app = setup(undefined, 'dist/client');
    const res = await request(app).get('/admin/games/g1/events');
    expect(res.status).toBe(404);
  });

  it('answers 401 without a token', async () => {
    const res = await request(setup('s3cret')).get('/admin/games/g1/events');
    expect(res.status).toBe(401);
  });

  it('answers 401 with a wrong token, including one of another length', async () => {
    const app = setup('s3cret');
    for (const bad of ['Bearer wrong', 'Bearer s3cret-and-more', 's3cret']) {
      const res = await request(app)
        .get('/admin/games/g1/events')
        .set('Authorization', bad);
      expect(res.status).toBe(401);
    }
  });

  it('returns the events of the game with the right token', async () => {
    const res = await request(setup('s3cret'))
      .get('/admin/games/g1/events')
      .set('Authorization', 'Bearer s3cret');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({
      eventType: 'GAME_STARTED',
      gameId: 'g1',
      payload: { playerCount: 4 },
    });
  });

  it('returns 404 for a game that has no events', async () => {
    const res = await request(setup('s3cret'))
      .get('/admin/games/nope/events')
      .set('Authorization', 'Bearer s3cret');
    expect(res.status).toBe(404);
  });
});

describe('GET /admin/rooms/:roomId/events', () => {
  it('answers 401 without a token', async () => {
    const res = await request(setup('s3cret')).get('/admin/rooms/r1/events');
    expect(res.status).toBe(401);
  });

  it('is disabled with 404 when no admin token is configured', async () => {
    const res = await request(setup(undefined))
      .get('/admin/rooms/r1/events')
      .set('Authorization', 'Bearer anything');
    expect(res.status).toBe(404);
  });

  it('returns every event of the room, so a caller can learn the game ids', async () => {
    const res = await request(setup('s3cret'))
      .get('/admin/rooms/r1/events')
      .set('Authorization', 'Bearer s3cret');
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(res.body.events[0]).toMatchObject({
      eventType: 'GAME_STARTED',
      roomId: 'r1',
      gameId: 'g1',
    });
  });

  it('returns 404 for a room that has no events', async () => {
    const res = await request(setup('s3cret'))
      .get('/admin/rooms/nope/events')
      .set('Authorization', 'Bearer s3cret');
    expect(res.status).toBe(404);
  });
});
