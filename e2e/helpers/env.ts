import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const PORT = 3100;
export const BASE_URL = `http://127.0.0.1:${PORT}`;
export const ADMIN_TOKEN = 'e2e-admin-token';

// The main process picks the path first and Playwright hands its environment to the workers,
// so the server and every worker agree on one SQLite file without a fixed location.
// CI sets E2E_LOG_DB so the file can be uploaded when a run fails.
process.env.E2E_LOG_DB ??= join(
  mkdtempSync(join(tmpdir(), 'wd-e2e-')),
  'events.db',
);
export const LOG_DB_PATH = process.env.E2E_LOG_DB;
