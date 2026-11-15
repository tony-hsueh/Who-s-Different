import { parseArgs } from 'node:util';
import { cleanupOldLogs } from '../src/server/log/cleanup.js';
import {
  allPrivateRecords,
  DEFAULT_LOG_DB_PATH,
  eventsForGame,
  eventsForRoom,
  openLogDb,
  privateRecordForGame,
} from '../src/server/log/db.js';

const { values } = parseArgs({
  options: {
    game: { type: 'string' },
    room: { type: 'string' },
    private: { type: 'boolean', default: false },
    cleanup: { type: 'boolean', default: false },
  },
});

const db = openLogDb(process.env.LOG_DB_PATH ?? DEFAULT_LOG_DB_PATH);

function print(rows: unknown): void {
  console.log(JSON.stringify(rows, null, 2));
}

if (values.cleanup) {
  cleanupOldLogs(db);
  console.log('removed log data older than 30 days');
} else if (values.private) {
  print(
    values.game ? privateRecordForGame(db, values.game) : allPrivateRecords(db),
  );
} else if (values.game) {
  print(eventsForGame(db, values.game));
} else if (values.room) {
  print(eventsForRoom(db, values.room));
} else {
  console.error(
    'usage: npm run logs -- --game <gameId> | --room <roomId> | --private [--game <gameId>]',
  );
  process.exitCode = 1;
}
db.close();
