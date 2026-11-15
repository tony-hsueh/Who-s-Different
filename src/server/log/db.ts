import Database from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PrivateGameRecord } from './noop-logger.js';

export type LogDb = Database.Database;

export type StoredEvent = {
  eventId: string;
  timestamp: string;
  roomId: string;
  gameId: string | null;
  roundNumber: number | null;
  playerId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
};

export type PrivateRecord = PrivateGameRecord & { createdAt: string };

export const DEFAULT_LOG_DB_PATH = './data/events.db';

const schema = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

export function openLogDb(path: string): LogDb {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.exec(schema);
  return db;
}

type EventRow = {
  event_id: string;
  timestamp: string;
  room_id: string;
  game_id: string | null;
  round_number: number | null;
  player_id: string | null;
  event_type: string;
  payload: string;
};

function toEvent(row: EventRow): StoredEvent {
  return {
    eventId: row.event_id,
    timestamp: row.timestamp,
    roomId: row.room_id,
    gameId: row.game_id,
    roundNumber: row.round_number,
    playerId: row.player_id,
    eventType: row.event_type,
    payload: JSON.parse(row.payload) as Record<string, unknown>,
  };
}

// rowid breaks ties between events written in the same millisecond.
export function eventsForGame(db: LogDb, gameId: string): StoredEvent[] {
  return (
    db
      .prepare(
        'SELECT * FROM game_events WHERE game_id = ? ORDER BY timestamp, rowid',
      )
      .all(gameId) as EventRow[]
  ).map(toEvent);
}

export function eventsForRoom(db: LogDb, roomId: string): StoredEvent[] {
  return (
    db
      .prepare(
        'SELECT * FROM game_events WHERE room_id = ? ORDER BY timestamp, rowid',
      )
      .all(roomId) as EventRow[]
  ).map(toEvent);
}

type PrivateRow = {
  game_id: string;
  question_pair_id: string;
  majority_word: string;
  minority_word: string;
  assignments: string;
  created_at: string;
};

function toPrivate(row: PrivateRow): PrivateRecord {
  return {
    gameId: row.game_id,
    questionPairId: row.question_pair_id,
    majorityWord: row.majority_word,
    minorityWord: row.minority_word,
    assignments: JSON.parse(row.assignments) as PrivateRecord['assignments'],
    createdAt: row.created_at,
  };
}

export function privateRecordForGame(
  db: LogDb,
  gameId: string,
): PrivateRecord | undefined {
  const row = db
    .prepare('SELECT * FROM game_private_records WHERE game_id = ?')
    .get(gameId) as PrivateRow | undefined;
  return row && toPrivate(row);
}

export function allPrivateRecords(db: LogDb): PrivateRecord[] {
  return (
    db
      .prepare('SELECT * FROM game_private_records ORDER BY created_at, rowid')
      .all() as PrivateRow[]
  ).map(toPrivate);
}
