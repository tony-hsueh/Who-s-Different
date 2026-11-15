import type { LogDb } from './db.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const RETENTION_MS = 30 * DAY_MS;
export const CLEANUP_INTERVAL_MS = DAY_MS;

export function cleanupOldLogs(db: LogDb, now: number = Date.now()): void {
  const cutoff = new Date(now - RETENTION_MS).toISOString();
  db.transaction(() => {
    db.prepare('DELETE FROM game_events WHERE timestamp < ?').run(cutoff);
    db.prepare('DELETE FROM game_private_records WHERE created_at < ?').run(
      cutoff,
    );
    db.prepare('DELETE FROM games WHERE started_at < ?').run(cutoff);
  })();
}

// Runs once now and then every 24 hours. Returns a function that stops it.
export function scheduleCleanup(
  db: LogDb,
  {
    now = Date.now,
    intervalMs = CLEANUP_INTERVAL_MS,
  }: { now?: () => number; intervalMs?: number } = {},
): () => void {
  const run = () => {
    try {
      cleanupOldLogs(db, now());
    } catch (error) {
      console.error('log cleanup failed', error);
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
