import { registerGameHandlers } from './handlers/game.js';
import { registerRoomHandlers } from './handlers/room.js';
import type { AppServer } from './broadcast.js';
import type { EventLogger } from './log/noop-logger.js';
import { RateLimiter, type RateLimitOptions } from './rate-limit.js';
import type { RoomStore } from './rooms/room-store.js';

export type SocketDeps = {
  io: AppServer;
  store: RoomStore;
  logger: EventLogger;
  now: () => number;
  rateLimit: RateLimitOptions;
};

export function registerSocketHandlers({
  io,
  store,
  logger,
  now,
  rateLimit,
}: SocketDeps): void {
  io.on('connection', (socket) => {
    const env = {
      io,
      socket,
      store,
      logger,
      limiter: new RateLimiter(rateLimit, now),
    };
    registerRoomHandlers(env);
    registerGameHandlers(env);
  });
}
