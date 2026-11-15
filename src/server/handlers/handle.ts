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
  limiter: RateLimiter;
};

export function logSafely(logger: EventLogger, event: LogEvent): void {
  try {
    logger.logEvent(event);
  } catch (error) {
    console.error('event logger failed', error);
  }
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
          const bound = env.socket.data.binding;
          logSafely(env.logger, {
            type: 'SERVER_ERROR',
            roomId: bound?.roomId,
            playerId: bound?.kind === 'player' ? bound.playerId : undefined,
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
      const binding = env.socket.data.binding;
      logSafely(env.logger, {
        type: 'OPERATION_REJECTED',
        roomId: binding?.roomId,
        playerId: binding?.kind === 'player' ? binding.playerId : undefined,
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
