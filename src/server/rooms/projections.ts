import type {
  PlayerPrivateState,
  PublicElimination,
  PublicGameResult,
  PublicRoomState,
} from '../../shared/room-types.js';
import { phaseOf, type Room } from './room-store.js';

// Everything a client may see goes through these two functions. Nothing here
// copies a secret word or a role before the game is finished, except the role
// of the player who was just voted out.

function lastElimination(room: Room): PublicElimination | undefined {
  const last = room.game?.eliminations.at(-1);
  if (!last || last.playerId === null || last.role === undefined) {
    return undefined;
  }
  return {
    roundNumber: last.roundNumber,
    playerId: last.playerId,
    role: last.role,
  };
}

function finishedResult(room: Room): PublicGameResult | undefined {
  const game = room.game;
  if (game?.phase !== 'finished' || game.winner === undefined) {
    return undefined;
  }
  return {
    winner: game.winner,
    majorityWord: game.majorityWord,
    minorityWord: game.minorityWord,
    players: game.players.map((p) => ({ playerId: p.playerId, role: p.role })),
    eliminations: game.eliminations.map((e) => ({ ...e })),
  };
}

export function toPublicRoomState(room: Room): PublicRoomState {
  const eliminated = new Set(
    room.game?.players.filter((p) => p.eliminated).map((p) => p.playerId),
  );
  const state: PublicRoomState = {
    roomId: room.roomId,
    roomCode: room.roomCode,
    phase: phaseOf(room),
    roundNumber: room.game?.roundNumber ?? 0,
    players: room.players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      avatarColor: p.avatarColor,
      avatarIndex: p.avatarIndex,
      eliminated: eliminated.has(p.playerId),
      online: p.online,
    })),
  };
  const last = lastElimination(room);
  if (last) state.lastElimination = last;
  const result = finishedResult(room);
  if (result) state.result = result;
  return state;
}

export function toPlayerPrivateState(
  room: Room,
  playerId: string,
): PlayerPrivateState | undefined {
  if (!room.players.some((p) => p.playerId === playerId)) return undefined;
  const own = room.game?.players.find((p) => p.playerId === playerId);
  return {
    playerId,
    phase: phaseOf(room),
    roundNumber: room.game?.roundNumber ?? 0,
    secretWord: own?.secretWord ?? null,
    eliminated: own?.eliminated ?? false,
  };
}
