import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import { eventsForGame, type LogDb } from '../log/db.js';

export interface AdminOptions {
  db: LogDb;
  token: string;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

function tokenMatches(header: string | undefined, token: string): boolean {
  const supplied = header?.match(/^Bearer (.+)$/)?.[1] ?? '';
  // Hashing first gives both sides the same length, so the compare is
  // constant time whatever the caller sent.
  return timingSafeEqual(digest(supplied), digest(token));
}

// Without options every /admin path answers 404, so a missing ADMIN_TOKEN
// cannot fall through to the SPA fallback or expose anything.
export function createAdminRouter(options: AdminOptions | undefined): Router {
  const router = Router();
  if (!options) {
    router.use((_req, res) => {
      res.status(404).json({ error: 'NOT_FOUND' });
    });
    return router;
  }
  const { db, token } = options;

  router.use((req, res, next) => {
    if (tokenMatches(req.header('authorization'), token)) return next();
    res.setHeader('WWW-Authenticate', 'Bearer');
    res.status(401).json({ error: 'UNAUTHORIZED' });
  });

  router.get('/games/:gameId/events', (req, res) => {
    const events = eventsForGame(db, req.params.gameId);
    if (events.length === 0) {
      res.status(404).json({ error: 'GAME_NOT_FOUND' });
      return;
    }
    res.json({ events });
  });

  return router;
}
