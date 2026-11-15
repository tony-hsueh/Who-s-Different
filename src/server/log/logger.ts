import { randomUUID } from 'node:crypto';
import type { LogDb } from './db.js';
import type {
  EventLogger,
  LogEvent,
  PrivateGameRecord,
} from './noop-logger.js';
import { redact } from './redact.js';

export interface SqliteLoggerOptions {
  now?: () => number;
  generateId?: () => string;
}

// Every call runs synchronously in one transaction, so rows land in the order
// the handlers produced them. The games table is derived from the events.
export function createSqliteLogger(
  db: LogDb,
  { now = Date.now, generateId = randomUUID }: SqliteLoggerOptions = {},
): EventLogger & Required<Pick<EventLogger, 'recordPrivateGame'>> {
  const insertEvent = db.prepare(
    `INSERT INTO game_events
       (event_id, timestamp, room_id, game_id, round_number, player_id, event_type, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertGame = db.prepare(
    `INSERT OR IGNORE INTO games
       (game_id, room_id, started_at, player_count, minority_count)
     VALUES (?, ?, ?, ?, ?)`,
  );
  const finishGame = db.prepare(
    'UPDATE games SET finished_at = ?, winner = ?, rounds = ? WHERE game_id = ?',
  );
  const insertPrivate = db.prepare(
    `INSERT OR REPLACE INTO game_private_records
       (game_id, question_pair_id, majority_word, minority_word, assignments, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const write = db.transaction((event: LogEvent) => {
    const timestamp = new Date(now()).toISOString();
    const payload = redact(event.payload);
    insertEvent.run(
      generateId(),
      timestamp,
      event.roomId ?? '',
      event.gameId ?? null,
      event.roundNumber ?? null,
      event.playerId ?? null,
      event.type,
      JSON.stringify(payload),
    );
    if (!event.gameId) return;
    if (event.type === 'GAME_STARTED') {
      insertGame.run(
        event.gameId,
        event.roomId ?? null,
        timestamp,
        payload.playerCount ?? null,
        payload.minorityCount ?? null,
      );
    } else if (event.type === 'GAME_FINISHED') {
      finishGame.run(
        timestamp,
        payload.winner ?? null,
        event.roundNumber ?? null,
        event.gameId,
      );
    }
  });

  const writePrivate = db.transaction((record: PrivateGameRecord) => {
    insertPrivate.run(
      record.gameId,
      record.questionPairId,
      record.majorityWord,
      record.minorityWord,
      JSON.stringify(record.assignments),
      new Date(now()).toISOString(),
    );
  });

  return {
    logEvent: (event) => write(event),
    recordPrivateGame: (record) => writePrivate(record),
  };
}
