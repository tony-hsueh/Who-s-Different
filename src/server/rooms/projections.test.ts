import { describe, expect, it } from 'vitest';
import { nextRound } from '../game/rules.js';
import { toPlayerPrivateState, toPublicRoomState } from './projections.js';
import {
  eliminateWhere,
  finishGame,
  lobbyWith,
  mustRoom,
  setup,
  skip,
  startedGame,
} from './test-helpers.js';

function secrets(room: ReturnType<typeof mustRoom>) {
  const game = room.game;
  if (!game) throw new Error('no game');
  return { majority: game.majorityWord, minority: game.minorityWord };
}

describe('toPublicRoomState', () => {
  it('describes a lobby with players offline by default', () => {
    const { store } = setup();
    const { roomId, roomCode } = lobbyWith(store, 3);
    const state = toPublicRoomState(mustRoom(store, roomId));
    expect(state).toMatchObject({
      roomId,
      roomCode,
      phase: 'lobby',
      roundNumber: 0,
    });
    expect(state.players).toHaveLength(3);
    for (const p of state.players) {
      expect(p).toEqual({
        playerId: expect.any(String),
        nickname: expect.any(String),
        avatarColor: expect.any(String),
        avatarIndex: expect.any(Number),
        eliminated: false,
        online: false,
      });
    }
    expect(state.lastElimination).toBeUndefined();
    expect(state.result).toBeUndefined();
  });

  it('contains no secret word while playing', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    const room = mustRoom(store, roomId);
    const { majority, minority } = secrets(room);
    const json = JSON.stringify(toPublicRoomState(room));
    expect(json).not.toContain(majority);
    expect(json).not.toContain(minority);
    expect(json).not.toContain('secretWord');
    expect(json).not.toContain('role');
    expect(toPublicRoomState(room)).toMatchObject({
      phase: 'playing',
      roundNumber: 1,
    });
  });

  it('shows the eliminated player and role in reveal, without secret words or other roles', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    const eliminatedId = eliminateWhere(store, roomId, 'majority');
    const room = mustRoom(store, roomId);
    const { majority, minority } = secrets(room);

    const state = toPublicRoomState(room);
    expect(state.phase).toBe('reveal');
    expect(state.lastElimination).toEqual({
      roundNumber: 1,
      playerId: eliminatedId,
      role: 'majority',
    });
    expect(
      state.players.find((p) => p.playerId === eliminatedId),
    ).toMatchObject({ eliminated: true });

    const json = JSON.stringify(state);
    expect(json).not.toContain(majority);
    expect(json).not.toContain(minority);
    expect(json).not.toContain('secretWord');
    expect(json.match(/"role"/g)).toHaveLength(1);
    expect(state.result).toBeUndefined();
  });

  it('leaves out lastElimination when the latest round was skipped', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    eliminateWhere(store, roomId, 'majority');
    store.applyRule(roomId, nextRound);
    skip(store, roomId);
    const state = toPublicRoomState(mustRoom(store, roomId));
    expect(state.phase).toBe('playing');
    expect(state.roundNumber).toBe(3);
    expect(state.lastElimination).toBeUndefined();
    expect(JSON.stringify(state)).not.toContain('role');
  });

  it('reveals words, every role and the round history once finished', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    eliminateWhere(store, roomId, 'majority');
    store.applyRule(roomId, nextRound);
    const minorityId = eliminateWhere(store, roomId, 'minority');
    const room = mustRoom(store, roomId);
    const game = room.game!;

    const state = toPublicRoomState(room);
    expect(state.phase).toBe('finished');
    expect(state.result).toEqual({
      winner: 'majority',
      majorityWord: game.majorityWord,
      minorityWord: game.minorityWord,
      players: game.players.map((p) => ({
        playerId: p.playerId,
        role: p.role,
      })),
      eliminations: game.eliminations,
    });
    expect(state.result?.eliminations.map((e) => e.playerId)).toContain(
      minorityId,
    );
    expect(state.result?.players).toHaveLength(6);
  });
});

describe('toPlayerPrivateState', () => {
  it('gives each player only their own secret word', () => {
    const { store } = setup();
    const { roomId, players } = startedGame(store);
    const room = mustRoom(store, roomId);
    const { majority, minority } = secrets(room);

    for (const { player } of players) {
      const own = room.game!.players.find(
        (p) => p.playerId === player.playerId,
      )!;
      const state = toPlayerPrivateState(room, player.playerId);
      expect(state).toMatchObject({
        playerId: player.playerId,
        secretWord: own.secretWord,
        eliminated: false,
        roundNumber: 1,
        phase: 'playing',
      });
      const json = JSON.stringify(state);
      const other = own.role === 'majority' ? minority : majority;
      expect(json).not.toContain(other);
    }
  });

  it('never includes role, in any phase', () => {
    const { store } = setup();
    const { roomId, players } = startedGame(store);
    const first = players[0]!.player.playerId;
    const check = () => {
      const json = JSON.stringify(
        toPlayerPrivateState(mustRoom(store, roomId), first),
      );
      expect(json).not.toContain('role');
      expect(json).not.toContain('majority"');
      expect(json).not.toContain('minority"');
    };
    check();
    eliminateWhere(store, roomId, 'majority');
    check();
    store.applyRule(roomId, nextRound);
    finishGame(store, roomId);
    check();
  });

  it('has no secret word in the lobby', () => {
    const { store } = setup();
    const { roomId, players } = lobbyWith(store, 3);
    expect(
      toPlayerPrivateState(
        mustRoom(store, roomId),
        players[0]!.player.playerId,
      ),
    ).toMatchObject({ secretWord: null, eliminated: false, roundNumber: 0 });
  });

  it('marks an eliminated player and keeps their word', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    const outId = eliminateWhere(store, roomId, 'majority');
    const room = mustRoom(store, roomId);
    const state = toPlayerPrivateState(room, outId);
    expect(state).toMatchObject({
      eliminated: true,
      secretWord: expect.any(String),
    });
  });

  it('returns undefined for someone who is not in the room', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    expect(
      toPlayerPrivateState(mustRoom(store, roomId), 'ghost'),
    ).toBeUndefined();
  });
});
