import type { Binding, SocketData } from './auth.js';
import { broadcastPublic, type AppServer } from './broadcast.js';
import { logSafely } from './handlers/handle.js';
import type { EventLogger } from './log/noop-logger.js';
import { PresenceTracker } from './presence.js';
import type { RoomStore } from './rooms/room-store.js';

export const DEFAULT_PRESENCE_DEBOUNCE_MS = 3_000;

type TrackedSocket = { id: string; data: SocketData };

export type PresenceDeps = {
  io: AppServer;
  store: RoomStore;
  logger: EventLogger;
  now: () => number;
  debounceMs: number;
};

const LOG_TYPES = {
  host: { DISCONNECTED: 'HOST_DISCONNECTED', RECONNECTED: 'HOST_RECONNECTED' },
  player: {
    DISCONNECTED: 'PLAYER_DISCONNECTED',
    RECONNECTED: 'PLAYER_RECONNECTED',
  },
} as const;

const keyOf = (b: Binding) =>
  b.kind === 'host' ? `host:${b.roomId}` : `player:${b.playerId}`;

// Connects presence to the room: the first connection of an identity marks it
// online at once, and the last one leaving marks it offline only after the
// debounce, so a flicker never reaches the big screen. Rooms keep the
// published value; the tracker holds the live sockets.
export function createPresence({
  io,
  store,
  logger,
  now,
  debounceMs,
}: PresenceDeps) {
  const tracker = new PresenceTracker(now);
  const published = new Set<string>();
  const timers = new Map<string, NodeJS.Timeout>();

  function clearTimer(key: string) {
    const timer = timers.get(key);
    if (timer) clearTimeout(timer);
    timers.delete(key);
  }

  function publish(binding: Binding, online: boolean): boolean {
    if (binding.kind === 'host') return true;
    const room = store.setPlayerOnline(binding.playerId, online);
    if (room) broadcastPublic(io, room);
    return room !== undefined;
  }

  function log(binding: Binding, change: 'DISCONNECTED' | 'RECONNECTED') {
    logSafely(logger, {
      type: LOG_TYPES[binding.kind][change],
      roomId: binding.roomId,
      playerId: binding.kind === 'player' ? binding.playerId : undefined,
      payload: {},
    });
  }

  return {
    connect(socket: TrackedSocket, binding: Binding): void {
      const key = keyOf(binding);
      const seenBefore = tracker.get(key) !== undefined;
      clearTimer(key);
      tracker.connect(key, socket.id);
      if (published.has(key)) return;
      published.add(key);
      publish(binding, true);
      if (seenBefore) log(binding, 'RECONNECTED');
    },

    disconnect(socket: TrackedSocket): void {
      const binding = socket.data.binding;
      if (!binding) return;
      const key = keyOf(binding);
      const entry = tracker.disconnect(key, socket.id);
      if (!entry || entry.online) return;
      clearTimer(key);
      const timer = setTimeout(() => {
        timers.delete(key);
        if (tracker.isOnline(key)) return;
        published.delete(key);
        if (!publish(binding, false)) {
          tracker.forget(key);
          return;
        }
        log(binding, 'DISCONNECTED');
      }, debounceMs);
      timer.unref();
      timers.set(key, timer);
    },

    forgetPlayer(playerId: string): void {
      const key = `player:${playerId}`;
      clearTimer(key);
      published.delete(key);
      tracker.forget(key);
    },

    close(): void {
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
  };
}

export type PresenceService = ReturnType<typeof createPresence>;
