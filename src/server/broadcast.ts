import type { Server } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '../shared/protocol.js';
import type { SocketData } from './auth.js';
import {
  toPlayerPrivateState,
  toPublicRoomState,
} from './rooms/projections.js';
import type { Room } from './rooms/room-store.js';

export type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<never, never>,
  SocketData
>;

export const roomChannel = (roomId: string) => `room:${roomId}`;
export const hostChannel = (roomId: string) => `host:${roomId}`;
export const playerChannel = (playerId: string) => `player:${playerId}`;

// The public state goes to the room channel (host and players). Each private
// state goes only to that player's channel, which no host socket ever joins.
export function broadcastPublic(io: AppServer, room: Room): void {
  io.to(roomChannel(room.roomId)).emit('room:state', toPublicRoomState(room));
}

export function broadcastRoom(io: AppServer, room: Room): void {
  broadcastPublic(io, room);
  for (const { playerId } of room.players) {
    const state = toPlayerPrivateState(room, playerId);
    if (state) io.to(playerChannel(playerId)).emit('game:player-state', state);
  }
}

export function closeRooms(io: AppServer, roomIds: readonly string[]): void {
  for (const roomId of roomIds) {
    io.to(roomChannel(roomId)).emit('room:closed', { roomId });
    io.in(roomChannel(roomId)).socketsLeave([
      roomChannel(roomId),
      hostChannel(roomId),
    ]);
  }
}
