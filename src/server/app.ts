import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import { contentSecurityPolicy } from './csp.js';
import { closeRooms, type AppServer } from './broadcast.js';
import { logSafely } from './handlers/handle.js';
import { noopLogger, type EventLogger } from './log/noop-logger.js';
import { questionBank } from './questions/bank.js';
import {
  createPresence,
  DEFAULT_PRESENCE_DEBOUNCE_MS,
} from './presence-sync.js';
import { DEFAULT_RATE_LIMIT, type RateLimitOptions } from './rate-limit.js';
import { RoomStore } from './rooms/room-store.js';
import { registerSocketHandlers } from './socket.js';

export const DEFAULT_SWEEP_INTERVAL_MS = 60_000;

export interface CreateAppOptions {
  clientDir?: string;
  store?: RoomStore;
  logger?: EventLogger;
  now?: () => number;
  sweepIntervalMs?: number;
  rateLimit?: RateLimitOptions;
  publicBaseUrl?: string | null;
  presenceDebounceMs?: number;
}

export function createApp({
  clientDir,
  now = Date.now,
  store = new RoomStore({ bank: questionBank, now }),
  logger = noopLogger,
  sweepIntervalMs = DEFAULT_SWEEP_INTERVAL_MS,
  rateLimit = DEFAULT_RATE_LIMIT,
  publicBaseUrl = null,
  presenceDebounceMs = DEFAULT_PRESENCE_DEBOUNCE_MS,
}: CreateAppOptions = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io: AppServer = new Server(httpServer);

  app.use(contentSecurityPolicy);

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/config', (_req, res) => {
    res.json({ publicBaseUrl });
  });

  if (clientDir) {
    const root = resolve(clientDir);
    app.use(express.static(root));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(join(root, 'index.html'));
    });
  }

  const presence = createPresence({
    io,
    store,
    logger,
    now,
    debounceMs: presenceDebounceMs,
  });
  registerSocketHandlers({ io, store, logger, now, rateLimit, presence });

  const sweepTimer = setInterval(() => {
    const removed = store.sweepExpired();
    if (removed.length === 0) return;
    closeRooms(io, removed);
    for (const roomId of removed) {
      presence.forgetRoom(roomId);
      logSafely(logger, { type: 'ROOM_CLOSED', roomId, payload: {} });
    }
  }, sweepIntervalMs);
  // The timer alone must not keep the process alive.
  sweepTimer.unref();
  const stopSweep = () => clearInterval(sweepTimer);
  httpServer.on('close', stopSweep);

  return {
    app,
    httpServer,
    io,
    store,
    stopSweep,
    // Closes every connection, the HTTP server and the sweep timer.
    async close() {
      stopSweep();
      await io.close();
      presence.close();
    },
  };
}
