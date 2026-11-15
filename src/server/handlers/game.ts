import type { GameState, RuleResult } from '../../shared/game-types.js';
import type { Ack, AckFailure } from '../../shared/protocol.js';
import { requireHost } from '../auth.js';
import { broadcastRoom } from '../broadcast.js';
import { eliminate, nextRound, skipRound } from '../game/rules.js';
import type { LogEvent } from '../log/noop-logger.js';
import { phaseOf, type Room } from '../rooms/room-store.js';
import { handle, logSafely, type HandlerEnv } from './handle.js';

const ok: Ack<null> = { ok: true, data: null };

function gameFields(
  room: Room,
): Pick<LogEvent, 'roomId' | 'gameId' | 'roundNumber'> {
  return {
    roomId: room.roomId,
    gameId: room.game?.gameId,
    roundNumber: room.game?.roundNumber,
  };
}

function staleRound(sent: number, current: number): AckFailure {
  return {
    ok: false,
    code: 'ROUND_MISMATCH',
    message: `Round ${sent} is not the current round (${current})`,
  };
}

export function registerGameHandlers(env: HandlerEnv): void {
  const { io, store, logger } = env;

  const log = (event: LogEvent) => logSafely(logger, event);
  const ignored = (room: Room, event: string): Ack<null> => {
    log({ type: 'OPERATION_IGNORED', ...gameFields(room), payload: { event } });
    return ok;
  };

  // Runs a rule transition after the round check, then broadcasts.
  const advance = (
    room: Room,
    transition: (game: GameState) => RuleResult,
  ): { ok: true; room: Room } | AckFailure => {
    const result = store.applyRule(room.roomId, transition);
    if (!result.ok) return result;
    broadcastRoom(io, result.room);
    return result;
  };

  handle(env, 'game:start', (_payload, binding) => {
    const host = requireHost(binding);
    if (!host.ok) return host;
    const room = store.getRoom(host.roomId);
    if (!room) return notFound();
    if (phaseOf(room) === 'playing') return ignored(room, 'game:start');
    const started = store.startGame(host.roomId);
    if (!started.ok) return started;
    broadcastRoom(io, started.room);
    log({
      type: 'GAME_STARTED',
      ...gameFields(started.room),
      payload: { playerCount: started.room.players.length },
    });
    return ok;
  });

  handle(env, 'game:eliminate', ({ roundNumber, playerId }, binding) => {
    const host = requireHost(binding);
    if (!host.ok) return host;
    const room = store.getRoom(host.roomId);
    if (!room) return notFound();
    if (room.game && room.game.roundNumber !== roundNumber) {
      return staleRound(roundNumber, room.game.roundNumber);
    }
    const result = advance(room, (game) => eliminate(game, playerId));
    if (!result.ok) return result;
    const { game } = result.room;
    const base = { ...gameFields(result.room), playerId };
    log({
      type: 'PLAYER_ELIMINATED',
      ...base,
      roundNumber,
      payload: { phase: game?.phase },
    });
    if (game?.phase === 'finished') {
      log({ type: 'GAME_FINISHED', ...base, payload: { winner: game.winner } });
    }
    return ok;
  });

  handle(env, 'game:skip-round', ({ roundNumber }, binding) => {
    const host = requireHost(binding);
    if (!host.ok) return host;
    const room = store.getRoom(host.roomId);
    if (!room) return notFound();
    if (room.game && room.game.roundNumber !== roundNumber) {
      return staleRound(roundNumber, room.game.roundNumber);
    }
    const result = advance(room, skipRound);
    if (!result.ok) return result;
    log({
      type: 'ROUND_SKIPPED',
      ...gameFields(result.room),
      roundNumber,
      payload: {},
    });
    return ok;
  });

  handle(env, 'game:next-round', (_payload, binding) => {
    const host = requireHost(binding);
    if (!host.ok) return host;
    const room = store.getRoom(host.roomId);
    if (!room) return notFound();
    if (phaseOf(room) === 'playing') return ignored(room, 'game:next-round');
    const result = advance(room, nextRound);
    if (!result.ok) return result;
    log({ type: 'ROUND_STARTED', ...gameFields(result.room), payload: {} });
    return ok;
  });

  handle(env, 'game:reset', (_payload, binding) => {
    const host = requireHost(binding);
    if (!host.ok) return host;
    const room = store.getRoom(host.roomId);
    if (!room) return notFound();
    if (phaseOf(room) === 'lobby') return ignored(room, 'game:reset');
    const reset = store.resetGame(host.roomId);
    if (!reset.ok) return reset;
    broadcastRoom(io, reset.room);
    log({ type: 'GAME_RESET', roomId: reset.room.roomId, payload: {} });
    return ok;
  });
}

function notFound(): AckFailure {
  return {
    ok: false,
    code: 'ROOM_NOT_FOUND',
    message: 'The room no longer exists',
  };
}
