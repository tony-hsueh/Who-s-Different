import type { GameState, RuleResult } from '../../shared/game-types.js';
import type { Ack, AckFailure } from '../../shared/protocol.js';
import { requireHost } from '../auth.js';
import { broadcastRoom } from '../broadcast.js';
import { countAlive, eliminate, nextRound, skipRound } from '../game/rules.js';
import type { LogEvent } from '../log/noop-logger.js';
import { phaseOf, type Room } from '../rooms/room-store.js';
import { handle, logSafely, recordPrivate, type HandlerEnv } from './handle.js';

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
    const { game } = started.room;
    const fields = gameFields(started.room);
    log({
      type: 'GAME_STARTED',
      ...fields,
      payload: {
        playerCount: started.room.players.length,
        minorityCount: game?.players.filter((p) => p.role === 'minority')
          .length,
      },
    });
    if (game) {
      log({
        type: 'WORDS_ASSIGNED',
        ...fields,
        payload: {
          questionPairId: game.questionPairId,
          playerCount: game.players.length,
        },
      });
      recordPrivate(logger, {
        gameId: game.gameId,
        questionPairId: game.questionPairId,
        majorityWord: game.majorityWord,
        minorityWord: game.minorityWord,
        assignments: game.players.map((p) => ({
          playerId: p.playerId,
          role: p.role,
        })),
      });
    }
    log({ type: 'ROUND_STARTED', ...fields, payload: {} });
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
    const base = { ...gameFields(result.room), playerId, roundNumber };
    log({ type: 'ELIMINATION_CONFIRMED', ...base, payload: {} });
    if (!game) return ok;
    const target = game.players.find((p) => p.playerId === playerId);
    log({
      type: 'PLAYER_ELIMINATED',
      ...base,
      payload: {
        gameId: game.gameId,
        round: roundNumber,
        eliminatedPlayerId: playerId,
        role: target?.role,
        remaining: countAlive(game),
        winReached: game.phase === 'finished',
        winner: game.winner,
      },
    });
    if (game.phase === 'finished') {
      log({
        type: 'WIN_CONDITION_MET',
        ...base,
        payload: { winner: game.winner, remaining: countAlive(game) },
      });
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
    log({ type: 'ROUND_STARTED', ...gameFields(result.room), payload: {} });
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
    log({ type: 'GAME_RESET', ...gameFields(room), payload: {} });
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
