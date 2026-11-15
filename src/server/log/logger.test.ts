import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupOldLogs, RETENTION_MS, scheduleCleanup } from './cleanup.js';
import {
  eventsForGame,
  eventsForRoom,
  openLogDb,
  privateRecordForGame,
  type LogDb,
} from './db.js';
import { createSqliteLogger } from './logger.js';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

let db: LogDb;
beforeEach(() => {
  db = openLogDb(':memory:');
});
afterEach(() => {
  db.close();
});

describe('sqlite logger', () => {
  it('stores an event with its columns and a JSON payload', () => {
    const logger = createSqliteLogger(db, { now: () => T0 });
    logger.logEvent({
      type: 'PLAYER_JOINED',
      roomId: 'r1',
      playerId: 'p1',
      payload: { playerCount: 3 },
    });
    expect(eventsForRoom(db, 'r1')).toEqual([
      {
        eventId: expect.any(String),
        timestamp: new Date(T0).toISOString(),
        roomId: 'r1',
        gameId: null,
        roundNumber: null,
        playerId: 'p1',
        eventType: 'PLAYER_JOINED',
        payload: { playerCount: 3 },
      },
    ]);
  });

  it('strips tokens from the payload before writing', () => {
    const logger = createSqliteLogger(db);
    logger.logEvent({
      type: 'ROOM_CREATED',
      roomId: 'r1',
      payload: { hostToken: 'SECRET-TOKEN', roomCode: 'ABCD' },
    });
    const raw = JSON.stringify(db.prepare('SELECT * FROM game_events').all());
    expect(raw).not.toContain('SECRET-TOKEN');
    expect(raw).toContain('ABCD');
  });

  it('returns events of one game in the order they were written', () => {
    const logger = createSqliteLogger(db, { now: () => T0 });
    const types = ['GAME_STARTED', 'ROUND_STARTED', 'ROUND_SKIPPED'] as const;
    for (const type of types) {
      logger.logEvent({ type, roomId: 'r1', gameId: 'g1', payload: {} });
    }
    logger.logEvent({
      type: 'GAME_STARTED',
      roomId: 'r1',
      gameId: 'g2',
      payload: {},
    });
    expect(eventsForGame(db, 'g1').map((e) => e.eventType)).toEqual(types);
  });

  it('keeps games metadata from start and finish events', () => {
    let t = T0;
    const logger = createSqliteLogger(db, { now: () => t });
    logger.logEvent({
      type: 'GAME_STARTED',
      roomId: 'r1',
      gameId: 'g1',
      roundNumber: 1,
      payload: { playerCount: 7, minorityCount: 2 },
    });
    t += 5000;
    logger.logEvent({
      type: 'GAME_FINISHED',
      roomId: 'r1',
      gameId: 'g1',
      roundNumber: 4,
      payload: { winner: 'minority' },
    });
    expect(db.prepare('SELECT * FROM games').all()).toEqual([
      {
        game_id: 'g1',
        room_id: 'r1',
        started_at: new Date(T0).toISOString(),
        finished_at: new Date(T0 + 5000).toISOString(),
        player_count: 7,
        minority_count: 2,
        winner: 'minority',
        rounds: 4,
      },
    ]);
  });

  it('stores the private record apart from the event table', () => {
    const logger = createSqliteLogger(db, { now: () => T0 });
    logger.recordPrivateGame({
      gameId: 'g1',
      questionPairId: 'q1',
      majorityWord: 'tea',
      minorityWord: 'coffee',
      assignments: [{ playerId: 'p1', role: 'minority' }],
    });
    expect(privateRecordForGame(db, 'g1')).toEqual({
      gameId: 'g1',
      questionPairId: 'q1',
      majorityWord: 'tea',
      minorityWord: 'coffee',
      assignments: [{ playerId: 'p1', role: 'minority' }],
      createdAt: new Date(T0).toISOString(),
    });
    const events = JSON.stringify(
      db.prepare('SELECT * FROM game_events').all(),
    );
    expect(events).not.toContain('coffee');
  });
});

describe('persistence', () => {
  it('still answers queries after the database is reopened', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wd-log-'));
    try {
      const path = join(dir, 'nested', 'events.db');
      const first = openLogDb(path);
      createSqliteLogger(first).logEvent({
        type: 'GAME_STARTED',
        roomId: 'r1',
        gameId: 'g1',
        payload: { playerCount: 4 },
      });
      first.close();

      const second = openLogDb(path);
      expect(eventsForGame(second, 'g1')).toHaveLength(1);
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('cleanup', () => {
  function seed(daysAgo: number, id: string, now: number) {
    const at = now - daysAgo * DAY;
    const logger = createSqliteLogger(db, { now: () => at });
    logger.logEvent({
      type: 'GAME_STARTED',
      roomId: `room-${id}`,
      gameId: id,
      payload: { playerCount: 4, minorityCount: 1 },
    });
    logger.recordPrivateGame({
      gameId: id,
      questionPairId: 'q',
      majorityWord: 'a',
      minorityWord: 'b',
      assignments: [],
    });
  }

  it('removes data older than 30 days and keeps 29 day old data', () => {
    const now = T0 + 100 * DAY;
    seed(31, 'old', now);
    seed(29, 'recent', now);

    cleanupOldLogs(db, now);

    expect(eventsForGame(db, 'old')).toHaveLength(0);
    expect(privateRecordForGame(db, 'old')).toBeUndefined();
    expect(db.prepare('SELECT game_id FROM games').all()).toEqual([
      { game_id: 'recent' },
    ]);
    expect(eventsForGame(db, 'recent')).toHaveLength(1);
    expect(privateRecordForGame(db, 'recent')).toBeDefined();
  });

  it('uses a 30 day retention', () => {
    expect(RETENTION_MS).toBe(30 * DAY);
  });

  it('runs at start and then every 24 hours', () => {
    vi.useFakeTimers();
    try {
      let now = T0 + 100 * DAY;
      seed(31, 'old', now);
      const stop = scheduleCleanup(db, { now: () => now });
      expect(eventsForGame(db, 'old')).toHaveLength(0);

      seed(40, 'older', now);
      vi.advanceTimersByTime(DAY - 1);
      expect(eventsForGame(db, 'older')).toHaveLength(1);

      now += DAY;
      vi.advanceTimersByTime(1);
      expect(eventsForGame(db, 'older')).toHaveLength(0);
      stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
