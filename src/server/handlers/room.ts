import type { AckFailure } from '../../shared/protocol.js';
import { bindHost, bindPlayer, requirePlayer, unbind } from '../auth.js';
import { broadcastRoom } from '../broadcast.js';
import {
  toPlayerPrivateState,
  toPublicRoomState,
} from '../rooms/projections.js';
import { handle, logSafely, type HandlerEnv } from './handle.js';

function fail(code: AckFailure['code'], message: string): AckFailure {
  return { ok: false, code, message };
}

export function registerRoomHandlers(env: HandlerEnv): void {
  const { io, socket, store, logger } = env;

  handle(env, 'room:create', () => {
    const created = store.createRoom();
    if (!created.ok) return created;
    const { room, hostToken } = created;
    logSafely(logger, {
      type: 'ROOM_CREATED',
      roomId: room.roomId,
      payload: { roomCode: room.roomCode },
    });
    return {
      ok: true,
      data: { roomId: room.roomId, roomCode: room.roomCode, hostToken },
    };
  });

  handle(env, 'host:auth', ({ hostToken }, binding) => {
    if (binding) {
      return fail('ALREADY_AUTHENTICATED', 'This connection is already bound');
    }
    const session = store.authenticateHost(hostToken);
    if (!session.ok) return session;
    const room = store.getRoom(session.roomId);
    if (!room) return fail('ROOM_NOT_FOUND', 'The room no longer exists');
    bindHost(socket, room.roomId);
    logSafely(logger, {
      type: 'HOST_AUTHENTICATED',
      roomId: room.roomId,
      payload: {},
    });
    return { ok: true, data: { state: toPublicRoomState(room) } };
  });

  handle(env, 'room:join', ({ roomCode, nickname }) => {
    const joined = store.joinRoom(roomCode, nickname);
    if (!joined.ok) return joined;
    const { room, player, sessionToken } = joined;
    broadcastRoom(io, room);
    logSafely(logger, {
      type: 'PLAYER_JOINED',
      roomId: room.roomId,
      playerId: player.playerId,
      payload: { playerCount: room.players.length },
    });
    return { ok: true, data: { playerId: player.playerId, sessionToken } };
  });

  handle(env, 'player:auth', ({ sessionToken }, binding) => {
    if (binding) {
      return fail('ALREADY_AUTHENTICATED', 'This connection is already bound');
    }
    const session = store.authenticatePlayer(sessionToken);
    if (!session.ok) return session;
    const room = store.getRoom(session.roomId);
    if (!room) return fail('ROOM_NOT_FOUND', 'The room no longer exists');
    const privateState = toPlayerPrivateState(room, session.playerId);
    if (!privateState)
      return fail('PLAYER_NOT_FOUND', 'You are not in this room');
    bindPlayer(socket, room.roomId, session.playerId);
    logSafely(logger, {
      type: 'PLAYER_AUTHENTICATED',
      roomId: room.roomId,
      playerId: session.playerId,
      payload: {},
    });
    return {
      ok: true,
      data: { state: toPublicRoomState(room), privateState },
    };
  });

  handle(env, 'room:leave', (_payload, binding) => {
    const caller = requirePlayer(binding);
    if (!caller.ok) return caller;
    const left = store.leaveRoom(caller.playerId);
    if (!left.ok) return left;
    unbind(socket);
    broadcastRoom(io, left.room);
    logSafely(logger, {
      type: 'PLAYER_LEFT',
      roomId: left.room.roomId,
      playerId: caller.playerId,
      payload: { playerCount: left.room.players.length },
    });
    return { ok: true, data: null };
  });
}
