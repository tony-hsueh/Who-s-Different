import type { Socket } from 'socket.io';
import type {
  Ack,
  AckFailure,
  ClientToServerEvents,
  Requests,
  ServerToClientEvents,
} from '../../shared/protocol.js';
import type { Binding, SocketData } from '../auth.js';
import type { AppServer } from '../broadcast.js';
import type {
  EventLogger,
  LogEvent,
  PrivateGameRecord,
} from '../log/noop-logger.js';
import type { PresenceService } from '../presence-sync.js';
import type { RateLimiter } from '../rate-limit.js';
import type { RoomStore } from '../rooms/room-store.js';
import { schemas } from './validate.js';

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>;

export type HandlerEnv = {
  io: AppServer;
  socket: AppSocket;
  store: RoomStore;
  logger: EventLogger;
  presence: PresenceService;
  limiter: RateLimiter;
};

export function logSafely(logger: EventLogger, event: LogEvent): void {
  try {
    logger.logEvent(event);
  } catch (error) {
    console.error('event logger failed', error);
  }
}

// Who sent the request and which game it belongs to, so failures show up in
// the per-game log.
function caller(
  env: HandlerEnv,
): Pick<LogEvent, 'roomId' | 'gameId' | 'roundNumber' | 'playerId'> {
  const binding = env.socket.data.binding;
  if (!binding) return {};
  const game = env.store.getRoom(binding.roomId)?.game;
  return {
    roomId: binding.roomId,
    gameId: game?.gameId,
    roundNumber: game?.roundNumber,
    playerId: binding.kind === 'player' ? binding.playerId : undefined,
  };
}

export function recordPrivate(
  logger: EventLogger,
  record: PrivateGameRecord,
): void {
  try {
    logger.recordPrivateGame?.(record);
  } catch (error) {
    console.error('private game record failed', error);
  }
}

function isAck(value: unknown): value is (response: unknown) => void {
  return typeof value === 'function';
}

function failure(code: AckFailure['code'], message: string): AckFailure {
  return { ok: false, code, message };
}

// Every request goes through here, in this order: rate limit, payload shape,
// then the handler (identity, permission, game state). A thrown error becomes
// INTERNAL_ERROR and a missing ack callback is tolerated.
export function handle<E extends keyof Requests>(
  env: HandlerEnv,
  event: E,
  run: (
    payload: Requests[E]['payload'],
    binding: Binding | undefined,
  ) => Ack<Requests[E]['data']>,
): void {
  const listener = (...args: unknown[]) => {
    const [first, second] = args;
    const ack = isAck(second) ? second : isAck(first) ? first : undefined;
    const raw = isAck(first) || first === undefined ? {} : first;

    let result: Ack<unknown>;
    if (!env.limiter.tryConsume()) {
      result = failure('RATE_LIMITED', 'Too many requests');
    } else {
      const parsed = schemas[event].safeParse(raw);
      if (!parsed.success) {
        result = failure('INVALID_PAYLOAD', 'Payload has the wrong shape');
      } else {
        try {
          result = run(parsed.data, env.socket.data.binding);
        } catch (error) {
          console.error(`handler for ${event} failed`, error);
          logSafely(env.logger, {
            type: 'SERVER_ERROR',
            ...caller(env),
            payload: {
              event,
              error: error instanceof Error ? error.name : 'unknown',
            },
          });
          result = failure('INTERNAL_ERROR', 'Something went wrong');
        }
      }
    }

    if (!result.ok) {
      logSafely(env.logger, {
        type: 'OPERATION_REJECTED',
        ...caller(env),
        payload: { event, code: result.code },
      });
    }
    ack?.(result);
  };
  // socket.io cannot index its typed listener map by a generic event name.
  (
    env.socket as unknown as {
      on(name: string, handler: (...args: unknown[]) => void): void;
    }
  ).on(event, listener);
}
