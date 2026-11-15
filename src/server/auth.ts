import type { AckFailure } from '../shared/protocol.js';
import { hostChannel, playerChannel, roomChannel } from './broadcast.js';

// Who a socket is. First binding only; PR-06 reworks this for reconnects.
export type Binding =
  | { kind: 'host'; roomId: string }
  | { kind: 'player'; roomId: string; playerId: string };

export type SocketData = { binding?: Binding };

type Bindable = {
  data: SocketData;
  join(rooms: string[]): unknown;
  leave(room: string): unknown;
};

export function bindHost(socket: Bindable, roomId: string): void {
  socket.data.binding = { kind: 'host', roomId };
  void socket.join([roomChannel(roomId), hostChannel(roomId)]);
}

export function bindPlayer(
  socket: Bindable,
  roomId: string,
  playerId: string,
): void {
  socket.data.binding = { kind: 'player', roomId, playerId };
  void socket.join([roomChannel(roomId), playerChannel(playerId)]);
}

export function unbind(socket: Bindable): void {
  const binding = socket.data.binding;
  if (!binding) return;
  void socket.leave(roomChannel(binding.roomId));
  void socket.leave(
    binding.kind === 'host'
      ? hostChannel(binding.roomId)
      : playerChannel(binding.playerId),
  );
  delete socket.data.binding;
}

function reject(
  code: 'UNAUTHENTICATED' | 'FORBIDDEN',
  message: string,
): AckFailure {
  return { ok: false, code, message };
}

export function requireHost(
  binding: Binding | undefined,
): { ok: true; roomId: string } | AckFailure {
  if (!binding) return reject('UNAUTHENTICATED', 'Authenticate first');
  if (binding.kind !== 'host') {
    return reject('FORBIDDEN', 'Only the host can do this');
  }
  return { ok: true, roomId: binding.roomId };
}

export function requirePlayer(
  binding: Binding | undefined,
): { ok: true; roomId: string; playerId: string } | AckFailure {
  if (!binding) return reject('UNAUTHENTICATED', 'Authenticate first');
  if (binding.kind !== 'player') {
    return reject('FORBIDDEN', 'Only a player can do this');
  }
  return { ok: true, roomId: binding.roomId, playerId: binding.playerId };
}
