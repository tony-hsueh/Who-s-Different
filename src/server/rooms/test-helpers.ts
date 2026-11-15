import { eliminate, skipRound } from '../game/rules.js';
import { createSeededRng } from '../game/random.js';
import { questionBank } from '../questions/bank.js';
import { RoomStore, type Room } from './room-store.js';

export function setup(seed = 7) {
  let t = 1_000_000;
  let n = 0;
  const store = new RoomStore({
    bank: questionBank,
    rng: createSeededRng(seed),
    now: () => t,
    generateId: () => `id-${++n}`,
    generateToken: () => `token-${++n}`,
  });
  return {
    store,
    advance: (ms: number) => {
      t += ms;
    },
    now: () => t,
  };
}

export function mustRoom(store: RoomStore, roomId: string): Room {
  const room = store.getRoom(roomId);
  if (!room) throw new Error(`room ${roomId} missing`);
  return room;
}

export function lobbyWith(store: RoomStore, count: number) {
  const created = store.createRoom();
  if (!created.ok) throw new Error('createRoom failed');
  const { roomId, roomCode } = created.room;
  const players = [];
  for (let i = 1; i <= count; i++) {
    const joined = store.joinRoom(roomCode, `P${i}`);
    if (!joined.ok) throw new Error(`join failed: ${joined.code}`);
    players.push(joined);
  }
  return { roomId, roomCode, hostToken: created.hostToken, players };
}

export function startedGame(store: RoomStore, count = 6) {
  const lobby = lobbyWith(store, count);
  const started = store.startGame(lobby.roomId);
  if (!started.ok) throw new Error(`start failed: ${started.code}`);
  return lobby;
}

function gameOf(store: RoomStore, roomId: string) {
  const game = mustRoom(store, roomId).game;
  if (!game) throw new Error('no game');
  return game;
}

export function eliminateWhere(
  store: RoomStore,
  roomId: string,
  role: 'majority' | 'minority',
) {
  const target = gameOf(store, roomId).players.find(
    (p) => p.role === role && !p.eliminated,
  );
  if (!target) throw new Error(`no alive ${role}`);
  const result = store.applyRule(roomId, (g) => eliminate(g, target.playerId));
  if (!result.ok) throw new Error(`eliminate failed: ${result.code}`);
  return target.playerId;
}

export function skip(store: RoomStore, roomId: string) {
  const result = store.applyRule(roomId, skipRound);
  if (!result.ok) throw new Error(`skip failed: ${result.code}`);
}

export function finishGame(store: RoomStore, roomId: string) {
  eliminateWhere(store, roomId, 'minority');
  if (mustRoom(store, roomId).game?.phase !== 'finished') {
    throw new Error('expected the game to be finished');
  }
}
