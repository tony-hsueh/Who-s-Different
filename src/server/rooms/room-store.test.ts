import { describe, expect, it } from 'vitest';
import { MAX_PLAYERS, MIN_PLAYERS, nextRound } from '../game/rules.js';
import { questionBank } from '../questions/bank.js';
import { SESSION_TTL_MS } from './sessions.js';
import { ROOM_IDLE_TTL_MS, RoomStore } from './room-store.js';
import {
  eliminateWhere,
  finishGame,
  lobbyWith,
  mustRoom,
  setup,
  startedGame,
} from './test-helpers.js';

describe('createRoom', () => {
  it('returns a room in the lobby with a UUID id, 6 char code and a host token', () => {
    const store = new RoomStore({ bank: questionBank });
    const created = store.createRoom();
    if (!created.ok) throw new Error('expected ok');
    expect(created.room.roomId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(created.room.roomCode).toMatch(/^[^0O1I]{6}$/);
    expect(created.room.game).toBeUndefined();
    expect(created.room.players).toEqual([]);
    expect(created.hostToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(store.authenticateHost(created.hostToken)).toEqual({
      ok: true,
      roomId: created.room.roomId,
    });
  });

  it('never gives two live rooms the same code', () => {
    const store = new RoomStore({ bank: questionBank });
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const created = store.createRoom();
      if (!created.ok) throw new Error('expected ok');
      codes.add(created.room.roomCode);
    }
    expect(codes.size).toBe(500);
  });

  it('draws again when the code is already taken', () => {
    let calls = 0;
    // First 12 draws give AAAAAA twice (room 1, then room 2's first try).
    const rng = () => (calls++ < 12 ? 0 : 0.5);
    const store = new RoomStore({ bank: questionBank, rng });
    const first = store.createRoom();
    const second = store.createRoom();
    if (!first.ok || !second.ok) throw new Error('expected ok');
    expect(first.room.roomCode).toBe('AAAAAA');
    expect(second.room.roomCode).not.toBe('AAAAAA');
  });

  it('fails with ROOM_CODE_UNAVAILABLE instead of looping forever', () => {
    const store = new RoomStore({ bank: questionBank, rng: () => 0 });
    expect(store.createRoom().ok).toBe(true);
    expect(store.createRoom()).toMatchObject({
      ok: false,
      code: 'ROOM_CODE_UNAVAILABLE',
    });
  });

  it('can find a room by id and by code', () => {
    const store = new RoomStore({ bank: questionBank });
    const created = store.createRoom();
    if (!created.ok) throw new Error('expected ok');
    expect(store.getRoom(created.room.roomId)).toBe(created.room);
    expect(store.getRoomByCode(created.room.roomCode)).toBe(created.room);
    expect(store.getRoom('nope')).toBeUndefined();
    expect(store.getRoomByCode('ZZZZZZ')).toBeUndefined();
  });
});

describe('joinRoom', () => {
  it('adds a player with an id, a session token and online false', () => {
    const { store } = setup();
    const created = store.createRoom();
    if (!created.ok) throw new Error('expected ok');
    const joined = store.joinRoom(created.room.roomCode, '小明');
    if (!joined.ok) throw new Error('expected ok');
    expect(joined.player.nickname).toBe('小明');
    expect(joined.player.online).toBe(false);
    expect(joined.room.players).toHaveLength(1);
    expect(store.authenticatePlayer(joined.sessionToken)).toEqual({
      ok: true,
      roomId: created.room.roomId,
      playerId: joined.player.playerId,
    });
  });

  it('issues base64url session tokens from 32 random bytes', () => {
    const store = new RoomStore({ bank: questionBank });
    const created = store.createRoom();
    if (!created.ok) throw new Error('expected ok');
    const a = store.joinRoom(created.room.roomCode, 'a');
    const b = store.joinRoom(created.room.roomCode, 'b');
    if (!a.ok || !b.ok) throw new Error('expected ok');
    expect(a.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.sessionToken).not.toBe(b.sessionToken);
    expect(a.player.playerId).not.toBe(b.player.playerId);
  });

  it('trims the nickname and accepts the room code in any case', () => {
    const { store } = setup();
    const created = store.createRoom();
    if (!created.ok) throw new Error('expected ok');
    const joined = store.joinRoom(
      ` ${created.room.roomCode.toLowerCase()} `,
      '  阿華  ',
    );
    if (!joined.ok) throw new Error('expected ok');
    expect(joined.player.nickname).toBe('阿華');
  });

  it.each(['', '   ', '\t\n'])('rejects the empty nickname %j', (nickname) => {
    const { store } = setup();
    const { roomCode } = lobbyWith(store, 0);
    expect(store.joinRoom(roomCode, nickname)).toMatchObject({
      ok: false,
      code: 'NICKNAME_EMPTY',
    });
  });

  it('allows 12 characters and rejects 13', () => {
    const { store } = setup();
    const { roomCode } = lobbyWith(store, 0);
    expect(store.joinRoom(roomCode, '一二三四五六七八九十甲乙').ok).toBe(true);
    expect(
      store.joinRoom(roomCode, '一二三四五六七八九十甲乙丙'),
    ).toMatchObject({ ok: false, code: 'NICKNAME_TOO_LONG' });
  });

  it('counts code points, so 12 emoji (24 UTF-16 units) are allowed and 13 are not', () => {
    const { store } = setup();
    const { roomCode } = lobbyWith(store, 0);
    expect(store.joinRoom(roomCode, '😀'.repeat(12)).ok).toBe(true);
    expect(store.joinRoom(roomCode, '😎'.repeat(13))).toMatchObject({
      ok: false,
      code: 'NICKNAME_TOO_LONG',
    });
  });

  it('measures length after trimming', () => {
    const { store } = setup();
    const { roomCode } = lobbyWith(store, 0);
    expect(store.joinRoom(roomCode, `  ${'a'.repeat(12)}  `).ok).toBe(true);
  });

  it('rejects an identical nickname in the same room, including after trimming', () => {
    const { store } = setup();
    const { roomCode } = lobbyWith(store, 0);
    expect(store.joinRoom(roomCode, 'Amy').ok).toBe(true);
    expect(store.joinRoom(roomCode, 'Amy')).toMatchObject({
      ok: false,
      code: 'NICKNAME_TAKEN',
    });
    expect(store.joinRoom(roomCode, ' Amy ')).toMatchObject({
      ok: false,
      code: 'NICKNAME_TAKEN',
    });
  });

  it('treats nicknames that differ only in case as different', () => {
    const { store } = setup();
    const { roomCode } = lobbyWith(store, 0);
    expect(store.joinRoom(roomCode, 'Amy').ok).toBe(true);
    expect(store.joinRoom(roomCode, 'amy').ok).toBe(true);
  });

  it('allows the same nickname in different rooms', () => {
    const { store } = setup();
    const a = lobbyWith(store, 0);
    const b = lobbyWith(store, 0);
    expect(store.joinRoom(a.roomCode, 'Amy').ok).toBe(true);
    expect(store.joinRoom(b.roomCode, 'Amy').ok).toBe(true);
  });

  it('frees a nickname when its owner leaves', () => {
    const { store } = setup();
    const { roomCode, players } = lobbyWith(store, 1);
    const first = players[0];
    if (!first) throw new Error('missing player');
    expect(store.leaveRoom(first.player.playerId).ok).toBe(true);
    expect(store.joinRoom(roomCode, 'P1').ok).toBe(true);
  });

  it('accepts 15 players and rejects the 16th with ROOM_FULL', () => {
    const { store } = setup();
    const { roomCode } = lobbyWith(store, MAX_PLAYERS);
    expect(store.joinRoom(roomCode, '第十六位')).toMatchObject({
      ok: false,
      code: 'ROOM_FULL',
    });
  });

  it('answers ROOM_NOT_FOUND for an unknown code', () => {
    const { store } = setup();
    expect(store.joinRoom('ZZZZZZ', 'Amy')).toMatchObject({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    });
  });

  it('rejects joining once the game has left the lobby', () => {
    const { store } = setup();
    const { roomId, roomCode } = startedGame(store);
    const late = () => store.joinRoom(roomCode, '遲到');
    expect(late()).toMatchObject({ ok: false, code: 'GAME_IN_PROGRESS' }); // playing
    eliminateWhere(store, roomId, 'majority');
    expect(mustRoom(store, roomId).game?.phase).toBe('reveal');
    expect(late()).toMatchObject({ ok: false, code: 'GAME_IN_PROGRESS' });
    store.applyRule(roomId, nextRound);
    finishGame(store, roomId);
    expect(late()).toMatchObject({ ok: false, code: 'GAME_IN_PROGRESS' }); // finished
    expect(mustRoom(store, roomId).players).toHaveLength(6);
  });

  it('gives each player a different avatar, in join order', () => {
    const { store } = setup();
    const { roomId } = lobbyWith(store, MAX_PLAYERS);
    const players = mustRoom(store, roomId).players;
    expect(players.map((p) => p.avatarIndex)).toEqual(
      Array.from({ length: MAX_PLAYERS }, (_, i) => i),
    );
    expect(new Set(players.map((p) => p.avatarColor)).size).toBe(MAX_PLAYERS);
  });

  it('reuses the lowest free avatar slot after someone leaves', () => {
    const { store } = setup();
    const { roomId, roomCode, players } = lobbyWith(store, 3);
    const second = players[1];
    if (!second) throw new Error('missing player');
    store.leaveRoom(second.player.playerId);
    const joined = store.joinRoom(roomCode, '新人');
    if (!joined.ok) throw new Error('expected ok');
    expect(joined.player.avatarIndex).toBe(1);
    expect(
      new Set(mustRoom(store, roomId).players.map((p) => p.avatarIndex)).size,
    ).toBe(3);
  });
});

describe('authenticate', () => {
  it('rejects a wrong token', () => {
    const { store } = setup();
    lobbyWith(store, 1);
    expect(store.authenticatePlayer('wrong')).toMatchObject({
      ok: false,
      code: 'INVALID_TOKEN',
    });
    expect(store.authenticateHost('wrong')).toMatchObject({
      ok: false,
      code: 'INVALID_TOKEN',
    });
  });

  it('rejects an expired token', () => {
    const { store, advance } = setup();
    const { hostToken, players } = lobbyWith(store, 1);
    const first = players[0];
    if (!first) throw new Error('missing player');
    advance(SESSION_TTL_MS);
    expect(store.authenticatePlayer(first.sessionToken)).toMatchObject({
      ok: false,
      code: 'TOKEN_EXPIRED',
    });
    expect(store.authenticateHost(hostToken)).toMatchObject({
      ok: false,
      code: 'TOKEN_EXPIRED',
    });
  });

  it('rejects a token whose room is gone', () => {
    const { store, advance } = setup();
    const { hostToken } = lobbyWith(store, 1);
    advance(ROOM_IDLE_TTL_MS);
    store.sweepExpired();
    expect(store.authenticateHost(hostToken)).toMatchObject({ ok: false });
  });
});

describe('leaveRoom', () => {
  it('removes the player in the lobby and ends their session', () => {
    const { store } = setup();
    const { roomId, players } = lobbyWith(store, 3);
    const leaving = players[0];
    if (!leaving) throw new Error('missing player');
    const result = store.leaveRoom(leaving.player.playerId);
    expect(result.ok).toBe(true);
    expect(mustRoom(store, roomId).players.map((p) => p.nickname)).toEqual([
      'P2',
      'P3',
    ]);
    expect(store.authenticatePlayer(leaving.sessionToken)).toMatchObject({
      ok: false,
    });
  });

  it('is rejected during the game and the player keeps the seat', () => {
    const { store } = setup();
    const { roomId, players } = startedGame(store);
    const first = players[0];
    if (!first) throw new Error('missing player');

    expect(store.leaveRoom(first.player.playerId)).toMatchObject({
      ok: false,
      code: 'GAME_IN_PROGRESS',
    });
    expect(mustRoom(store, roomId).players).toHaveLength(6);
    expect(store.authenticatePlayer(first.sessionToken).ok).toBe(true);

    finishGame(store, roomId);
    expect(store.leaveRoom(first.player.playerId)).toMatchObject({
      ok: false,
      code: 'GAME_IN_PROGRESS',
    });
    expect(mustRoom(store, roomId).players).toHaveLength(6);
  });

  it('answers PLAYER_NOT_FOUND for an unknown player', () => {
    const { store } = setup();
    expect(store.leaveRoom('ghost')).toMatchObject({
      ok: false,
      code: 'PLAYER_NOT_FOUND',
    });
  });
});

describe('startGame', () => {
  it.each([0, 1, MIN_PLAYERS - 1])(
    'rejects %i players with NOT_ENOUGH_PLAYERS',
    (count) => {
      const { store } = setup();
      const { roomId } = lobbyWith(store, count);
      expect(store.startGame(roomId)).toMatchObject({
        ok: false,
        code: 'NOT_ENOUGH_PLAYERS',
      });
      expect(mustRoom(store, roomId).game).toBeUndefined();
    },
  );

  it('starts with 4 players and locks the roster', () => {
    const { store } = setup();
    const { roomId, players } = lobbyWith(store, MIN_PLAYERS);
    const result = store.startGame(roomId);
    if (!result.ok) throw new Error('expected ok');
    const game = result.room.game;
    expect(game?.phase).toBe('playing');
    expect(game?.roundNumber).toBe(1);
    expect(game?.players.map((p) => p.playerId)).toEqual(
      players.map((p) => p.player.playerId),
    );
    expect(mustRoom(store, roomId)).toBe(result.room);
  });

  it('draws a question from the bank and remembers it', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    const room = mustRoom(store, roomId);
    expect(room.recentQuestionIds).toEqual([room.game?.questionPairId]);
    expect(questionBank.map((q) => q.id)).toContain(room.game?.questionPairId);
  });

  it('rejects a second start with INVALID_PHASE', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    expect(store.startGame(roomId)).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
  });

  it('answers ROOM_NOT_FOUND for an unknown room', () => {
    const { store } = setup();
    expect(store.startGame('nope')).toMatchObject({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    });
  });
});

describe('resetGame', () => {
  it('is rejected unless the game is finished', () => {
    const { store } = setup();
    const lobby = lobbyWith(store, 5);
    expect(store.resetGame(lobby.roomId)).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
    store.startGame(lobby.roomId);
    expect(store.resetGame(lobby.roomId)).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
    eliminateWhere(store, lobby.roomId, 'majority');
    expect(store.resetGame(lobby.roomId)).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
    expect(mustRoom(store, lobby.roomId).game).toBeDefined();
  });

  it('answers ROOM_NOT_FOUND for an unknown room', () => {
    const { store } = setup();
    expect(store.resetGame('nope')).toMatchObject({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    });
  });

  it('returns to the lobby, clears the game and keeps players and sessions', () => {
    const { store } = setup();
    const { roomId, roomCode, players } = startedGame(store);
    finishGame(store, roomId);
    const before = mustRoom(store, roomId).players;

    const result = store.resetGame(roomId);
    expect(result.ok).toBe(true);
    const room = mustRoom(store, roomId);
    expect(room.game).toBeUndefined();
    expect(room.players).toEqual(before);
    expect(store.authenticatePlayer(players[0]!.sessionToken).ok).toBe(true);
    expect(store.joinRoom(roomCode, '新朋友').ok).toBe(true);
  });

  it('plays again with a new question and fresh roles, never the same question twice in a row', () => {
    const { store } = setup();
    const { roomId } = lobbyWith(store, 6);
    const minorities = new Set<string>();
    let previousQuestion: string | undefined;
    for (let i = 0; i < 40; i++) {
      const started = store.startGame(roomId);
      if (!started.ok) throw new Error(`start failed: ${started.code}`);
      const game = started.room.game!;
      expect(game.questionPairId).not.toBe(previousQuestion);
      previousQuestion = game.questionPairId;
      minorities.add(game.players.find((p) => p.role === 'minority')!.playerId);
      finishGame(store, roomId);
      expect(store.resetGame(roomId).ok).toBe(true);
    }
    expect(minorities.size).toBeGreaterThan(1);
    expect(mustRoom(store, roomId).recentQuestionIds).toHaveLength(40);
  });
});

describe('applyRule', () => {
  it('stores the new game state', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    eliminateWhere(store, roomId, 'majority');
    const game = mustRoom(store, roomId).game;
    expect(game?.phase).toBe('reveal');
    expect(game?.eliminations).toHaveLength(1);
  });

  it('passes rule errors through and leaves the room untouched', () => {
    const { store } = setup();
    const { roomId } = startedGame(store);
    const before = mustRoom(store, roomId);
    expect(store.applyRule(roomId, nextRound)).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
    expect(mustRoom(store, roomId)).toBe(before);
  });

  it('is INVALID_PHASE in the lobby and ROOM_NOT_FOUND for an unknown room', () => {
    const { store } = setup();
    const { roomId } = lobbyWith(store, 4);
    expect(store.applyRule(roomId, nextRound)).toMatchObject({
      ok: false,
      code: 'INVALID_PHASE',
    });
    expect(store.applyRule('nope', nextRound)).toMatchObject({
      ok: false,
      code: 'ROOM_NOT_FOUND',
    });
  });
});

describe('sweepExpired', () => {
  it('removes rooms idle for 2 hours, with their sessions', () => {
    const { store, advance } = setup();
    const { roomId, roomCode, players } = lobbyWith(store, 2);
    advance(ROOM_IDLE_TTL_MS - 1);
    expect(store.sweepExpired()).toEqual([]);
    advance(1);
    expect(store.sweepExpired()).toEqual([roomId]);
    expect(store.getRoom(roomId)).toBeUndefined();
    expect(store.getRoomByCode(roomCode)).toBeUndefined();
    expect(store.authenticatePlayer(players[0]!.sessionToken)).toMatchObject({
      ok: false,
    });
  });

  it('keeps a room that saw activity', () => {
    const { store, advance } = setup();
    const quiet = lobbyWith(store, 1);
    advance(ROOM_IDLE_TTL_MS - 10);
    const busy = lobbyWith(store, 1);
    advance(10);
    expect(store.sweepExpired()).toEqual([quiet.roomId]);
    expect(store.getRoom(busy.roomId)).toBeDefined();
  });

  it('counts a join as activity', () => {
    const { store, advance } = setup();
    const { roomId, roomCode } = lobbyWith(store, 1);
    advance(ROOM_IDLE_TTL_MS - 1);
    store.joinRoom(roomCode, 'late');
    advance(ROOM_IDLE_TTL_MS - 1);
    expect(store.sweepExpired()).toEqual([]);
    expect(store.getRoom(roomId)).toBeDefined();
  });

  it('also drops expired tokens of rooms that stay', () => {
    const { store, advance } = setup();
    const { hostToken, roomId } = lobbyWith(store, 1);
    advance(SESSION_TTL_MS);
    store.joinRoom(mustRoom(store, roomId).roomCode, 'keepalive');
    store.sweepExpired();
    expect(store.authenticateHost(hostToken)).toMatchObject({
      ok: false,
      code: 'INVALID_TOKEN',
    });
  });
});
