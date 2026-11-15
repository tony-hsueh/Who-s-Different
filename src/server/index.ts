import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { scheduleCleanup } from './log/cleanup.js';
import { DEFAULT_LOG_DB_PATH, openLogDb } from './log/db.js';
import { createSqliteLogger } from './log/logger.js';
import { questionBank } from './questions/bank.js';
import { validateBank } from './questions/validate.js';

const port = Number(process.env.PORT ?? 3000);

// Compiled to dist/server/server/index.js, so ../../client is dist/client.
// Under `tsx src/server/index.ts` the same path misses, so dev serves no UI.
const builtClient = fileURLToPath(new URL('../../client', import.meta.url));
const clientDir = existsSync(builtClient) ? builtClient : undefined;

// A bad bank must stop the server from starting.
validateBank(questionBank);

const db = openLogDb(process.env.LOG_DB_PATH ?? DEFAULT_LOG_DB_PATH);
scheduleCleanup(db);

// The admin endpoint stays off (404) unless ADMIN_TOKEN is set.
const adminToken = process.env.ADMIN_TOKEN;
const { httpServer } = createApp({
  clientDir,
  logger: createSqliteLogger(db),
  admin: adminToken ? { db, token: adminToken } : undefined,
});
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`listening on http://0.0.0.0:${port}`);
});
