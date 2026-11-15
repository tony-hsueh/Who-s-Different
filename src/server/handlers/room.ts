import type { AckFailure } from '../../shared/protocol.js';
import {
  bindHost,
  bindPlayer,
  canBind,
  requirePlayer,
  unbind,
} from '../auth.js';
import { broadcastRoom } from '../broadcast.js';
import {
  toPlayerPrivateState,
  toPublicRoomState,
} from '../rooms/projections.js';
import type { Room } from '../rooms/room-store.js';
import { handle, logSafely, type HandlerEnv } from './handle.js';

function fail(code: AckFailure['code'], message: string): AckFailure {
  return { ok: false, code, message };
}

export function registerRoomHandlers(env: HandlerEnv): void {
  const { io, socket, store, logger, presence } = env;

  // Binding may have just flipped a player online, so read the room again.
  const currentState = (roomId: string, fallback: Room) =>
    toPublicRoomState(store.getRoom(roomId) ?? fallback);

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
    const session = store.authenticateHost(hostToken);
    if (!session.ok) return session;
    const room = store.getRoom(session.roomId);
    if (!room) return fail('ROOM_NOT_FOUND', 'The room no longer exists');
    if (!canBind(binding, { kind: 'host', roomId: room.roomId })) {
      return fail('ALREADY_AUTHENTICATED', 'This connection is already bound');
    }
    presence.connect(socket, bindHost(socket, room.roomId));
    logSafely(logger, {
      type: 'HOST_AUTHENTICATED',
      roomId: room.roomId,
      payload: {},
    });
    return { ok: true, data: { state: currentState(room.roomId, room) } };
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
    const session = store.authenticatePlayer(sessionToken);
    if (!session.ok) return session;
    const room = store.getRoom(session.roomId);
    if (!room) return fail('ROOM_NOT_FOUND', 'The room no longer exists');
    const privateState = toPlayerPrivateState(room, session.playerId);
    if (!privateState)
      return fail('PLAYER_NOT_FOUND', 'You are not in this room');
    const target = {
      kind: 'player',
      roomId: room.roomId,
      playerId: session.playerId,
    } as const;
    if (!canBind(binding, target)) {
      return fail('ALREADY_AUTHENTICATED', 'This connection is already bound');
    }
    presence.connect(socket, bindPlayer(socket, room.roomId, session.playerId));
    logSafely(logger, {
      type: 'PLAYER_AUTHENTICATED',
      roomId: room.roomId,
      playerId: session.playerId,
      payload: {},
    });
    return {
      ok: true,
      data: { state: currentState(room.roomId, room), privateState },
    };
  });

  handle(env, 'room:leave', (_payload, binding) => {
    const caller = requirePlayer(binding);
    if (!caller.ok) return caller;
    if (!store.getRoom(caller.roomId)) {
      return fail('ROOM_NOT_FOUND', 'The room no longer exists');
    }
    const left = store.leaveRoom(caller.playerId);
    if (!left.ok) return left;
    presence.forgetPlayer(caller.playerId);
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
