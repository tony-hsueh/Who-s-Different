import { createServer } from 'node:http';
import { join, resolve } from 'node:path';
import express from 'express';
import { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/index.js';

export interface CreateAppOptions {
  clientDir?: string;
}

export function createApp({ clientDir }: CreateAppOptions = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer);

  app.get('/healthz', (_req, res) => {
    res.json({ ok: true });
  });

  if (clientDir) {
    const root = resolve(clientDir);
    app.use(express.static(root));
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.sendFile(join(root, 'index.html'));
    });
  }

  io.on('connection', (socket) => {
    socket.on('echo', (payload, ack) => {
      // A client that skips the ack callback must not crash the process.
      if (typeof ack === 'function') ack(payload);
    });
  });

  return { app, httpServer, io };
}
