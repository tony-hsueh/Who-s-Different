import { randomBytes, randomUUID } from 'node:crypto';
import type {
  GamePhase,
  GameState,
  RuleResult,
} from '../../shared/game-types.js';
import {
  NICKNAME_MAX_LENGTH,
  type RoomErrorCode,
  type RoomFailure,
} from '../../shared/room-types.js';
import type { Rng } from '../game/random.js';
import { MAX_PLAYERS, MIN_PLAYERS, createGame } from '../game/rules.js';
import type { QuestionPair } from '../questions/bank.js';
import { pickQuestion } from '../questions/pick.js';
import { generateRoomCode, normalizeRoomCode } from './room-code.js';
import {
  SessionRegistry,
  type HostSession,
  type PlayerSession,
  type TokenFailure,
} from './sessions.js';

export const ROOM_IDLE_TTL_MS = 2 * 60 * 60 * 1000;

const ROOM_CODE_ATTEMPTS = 1000;

// One colour per seat; avatarIndex is the seat and also picks the icon.
export const AVATAR_COLORS: readonly string[] = [
  '#e63946',
  '#f4a261',
  '#e9c46a',
  '#2a9d8f',
  '#457b9d',
  '#8e5fd0',
  '#d6336c',
  '#52b788',
  '#fb8500',
  '#4361ee',
  '#06a77d',
  '#b5179e',
  '#ff6b6b',
  '#3a86ff',
  '#8d6e63',
];

export type RoomPlayer = {
  readonly playerId: string;
  readonly nickname: string;
  readonly avatarColor: string;
  readonly avatarIndex: number;
  readonly online: boolean;
};

// Rooms are replaced, never mutated, so a Room a caller holds stays valid.
// Not for clients: it holds the secret game state. Send it through projections.
export type Room = {
  readonly roomId: string;
  readonly roomCode: string;
  readonly players: readonly RoomPlayer[];
  readonly game?: GameState;
  // Question ids of this room's past games, oldest first (pickQuestion input).
  readonly recentQuestionIds: readonly string[];
  readonly lastActivityAt: number;
};

export function phaseOf(room: Room): GamePhase {
  return room.game?.phase ?? 'lobby';
}

export type RoomStoreDeps = {
  bank: readonly QuestionPair[];
  rng: Rng;
  now: () => number;
  generateId: () => string;
  generateToken: () => string;
};

function fail(code: RoomErrorCode, message: string): RoomFailure {
  return { ok: false, code, message };
}

export class RoomStore {
  private readonly rooms = new Map<string, Room>();
  private readonly sessions: SessionRegistry;
  private readonly deps: RoomStoreDeps;

  constructor(deps: Pick<RoomStoreDeps, 'bank'> & Partial<RoomStoreDeps>) {
    this.deps = {
      rng: Math.random,
      now: Date.now,
      generateId: randomUUID,
      generateToken: () => randomBytes(32).toString('base64url'),
      ...deps,
    };
    this.sessions = new SessionRegistry({ now: this.deps.now });
  }

  createRoom(): { ok: true; room: Room; hostToken: string } | RoomFailure {
    const roomCode = this.freeRoomCode();
    if (roomCode === undefined) {
      return fail(
        'ROOM_CODE_UNAVAILABLE',
        'Could not find an unused room code',
      );
    }
    const room: Room = {
      roomId: this.deps.generateId(),
      roomCode,
      players: [],
      recentQuestionIds: [],
      lastActivityAt: this.deps.now(),
    };
    const hostToken = this.issueToken(room.roomId);
    this.rooms.set(room.roomId, room);
    this.sessions.registerHost(hostToken, room.roomId);
    return { ok: true, room, hostToken };
  }

  joinRoom(
    code: string,
    nickname: string,
  ):
    | { ok: true; room: Room; player: RoomPlayer; sessionToken: string }
    | RoomFailure {
    const room = this.getRoomByCode(code);
    if (!room) return fail('ROOM_NOT_FOUND', `No room with code ${code}`);
    if (phaseOf(room) !== 'lobby') {
      return fail('GAME_IN_PROGRESS', 'The game has already started');
    }

    const name = nickname.trim();
    if (name === '') return fail('NICKNAME_EMPTY', 'Nickname is empty');
    // Code points, not UTF-16 units: an emoji counts as one character.
    if ([...name].length > NICKNAME_MAX_LENGTH) {
      return fail(
        'NICKNAME_TOO_LONG',
        `Nickname is longer than ${NICKNAME_MAX_LENGTH} characters`,
      );
    }
    if (room.players.some((p) => p.nickname === name)) {
      return fail('NICKNAME_TAKEN', 'Nickname is already used in this room');
    }
    if (room.players.length >= MAX_PLAYERS) {
      return fail('ROOM_FULL', `Room already has ${MAX_PLAYERS} players`);
    }

    const taken = new Set(room.players.map((p) => p.avatarIndex));
    let avatarIndex = 0;
    while (taken.has(avatarIndex)) avatarIndex++;
    const player: RoomPlayer = {
      playerId: this.deps.generateId(),
      nickname: name,
      avatarColor: AVATAR_COLORS[avatarIndex] as string,
      avatarIndex,
      online: false,
    };
    const sessionToken = this.issueToken(room.roomId);
    this.sessions.registerPlayer(sessionToken, room.roomId, player.playerId);
    const updated = this.update(room, { players: [...room.players, player] });
    return { ok: true, room: updated, player, sessionToken };
  }

  leaveRoom(playerId: string): { ok: true; room: Room } | RoomFailure {
    const room = [...this.rooms.values()].find((r) =>
      r.players.some((p) => p.playerId === playerId),
    );
    if (!room) return fail('PLAYER_NOT_FOUND', `Unknown player ${playerId}`);
    if (phaseOf(room) !== 'lobby') {
      return fail(
        'GAME_IN_PROGRESS',
        'Players cannot leave until the game is reset',
      );
    }
    this.sessions.removePlayer(playerId);
    const updated = this.update(room, {
      players: room.players.filter((p) => p.playerId !== playerId),
    });
    return { ok: true, room: updated };
  }

  startGame(roomId: string): { ok: true; room: Room } | RoomFailure {
    const room = this.rooms.get(roomId);
    if (!room) return fail('ROOM_NOT_FOUND', `No room ${roomId}`);
    if (phaseOf(room) !== 'lobby') {
      return fail('INVALID_PHASE', 'A game is already under way');
    }
    if (room.players.length < MIN_PLAYERS) {
      return fail(
        'NOT_ENOUGH_PLAYERS',
        `Need at least ${MIN_PLAYERS} players, have ${room.players.length}`,
      );
    }

    const pair = pickQuestion({
      bank: this.deps.bank,
      recentIds: room.recentQuestionIds,
      rng: this.deps.rng,
    });
    const created = createGame({
      playerIds: room.players.map((p) => p.playerId),
      pair,
      rng: this.deps.rng,
      gameId: this.deps.generateId(),
    });
    if (!created.ok) return created;
    const updated = this.update(room, {
      game: created.state,
      recentQuestionIds: [...room.recentQuestionIds, pair.id],
    });
    return { ok: true, room: updated };
  }

  resetGame(roomId: string): { ok: true; room: Room } | RoomFailure {
    const room = this.rooms.get(roomId);
    if (!room) return fail('ROOM_NOT_FOUND', `No room ${roomId}`);
    if (phaseOf(room) !== 'finished') {
      return fail('INVALID_PHASE', 'Only a finished game can be reset');
    }
    return { ok: true, room: this.update(room, { game: undefined }) };
  }

  // Runs a PR-02 transition (eliminate, skipRound, nextRound) on the room's game.
  applyRule(
    roomId: string,
    transition: (game: GameState) => RuleResult,
  ): { ok: true; room: Room } | RoomFailure {
    const room = this.rooms.get(roomId);
    if (!room) return fail('ROOM_NOT_FOUND', `No room ${roomId}`);
    if (!room.game) return fail('INVALID_PHASE', 'No game has started');
    const result = transition(room.game);
    if (!result.ok) return result;
    return { ok: true, room: this.update(room, { game: result.state }) };
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomByCode(code: string): Room | undefined {
    const normalized = normalizeRoomCode(code);
    return [...this.rooms.values()].find((r) => r.roomCode === normalized);
  }

  authenticatePlayer(
    token: string,
  ): PlayerSession | TokenFailure | RoomFailure {
    const session = this.sessions.verifyPlayer(token);
    return session.ok ? session : this.roomGone(token, session);
  }

  authenticateHost(token: string): HostSession | TokenFailure | RoomFailure {
    const session = this.sessions.verifyHost(token);
    return session.ok ? session : this.roomGone(token, session);
  }

  // Connection state is not activity, so it leaves lastActivityAt alone.
  setPlayerOnline(playerId: string, online: boolean): Room | undefined {
    const room = [...this.rooms.values()].find((r) =>
      r.players.some((p) => p.playerId === playerId),
    );
    if (!room) return undefined;
    const updated: Room = {
      ...room,
      players: room.players.map((p) =>
        p.playerId === playerId ? { ...p, online } : p,
      ),
    };
    this.rooms.set(room.roomId, updated);
    return updated;
  }

  // Drops rooms idle for 2 hours, then expired tokens. Returns the removed
  // room ids so the caller can close their connections.
  sweepExpired(now: number = this.deps.now()): string[] {
    const removed: string[] = [];
    for (const room of this.rooms.values()) {
      if (now - room.lastActivityAt >= ROOM_IDLE_TTL_MS) {
        this.rooms.delete(room.roomId);
        this.sessions.removeRoom(room.roomId);
        removed.push(room.roomId);
      }
    }
    this.sessions.sweepExpired(now);
    return removed;
  }

  // Tokens start with their room id, so a token nobody knows but whose room is
  // gone (after a restart or a sweep) can be told apart from garbage.
  private issueToken(roomId: string): string {
    return `${roomId}.${this.deps.generateToken()}`;
  }

  private roomGone(
    token: string,
    failure: TokenFailure,
  ): TokenFailure | RoomFailure {
    const dot = token.indexOf('.');
    if (
      failure.code === 'INVALID_TOKEN' &&
      dot > 0 &&
      !this.rooms.has(token.slice(0, dot))
    ) {
      return fail('ROOM_NOT_FOUND', 'The room no longer exists');
    }
    return failure;
  }

  private update(room: Room, patch: Partial<Room>): Room {
    const updated: Room = {
      ...room,
      ...patch,
      lastActivityAt: this.deps.now(),
    };
    this.rooms.set(room.roomId, updated);
    return updated;
  }

  private freeRoomCode(): string | undefined {
    const inUse = new Set([...this.rooms.values()].map((r) => r.roomCode));
    for (let i = 0; i < ROOM_CODE_ATTEMPTS; i++) {
      const code = generateRoomCode(this.deps.rng);
      if (!inUse.has(code)) return code;
    }
    return undefined;
  }
}
