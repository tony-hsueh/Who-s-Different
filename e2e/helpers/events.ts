import { ADMIN_TOKEN, BASE_URL } from './env.js';

export interface LoggedEvent {
  eventId: string;
  timestamp: string;
  roomId: string;
  gameId: string | null;
  roundNumber: number | null;
  playerId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
}

async function adminGet(path: string, token = ADMIN_TOKEN) {
  return fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function events(path: string): Promise<LoggedEvent[]> {
  const res = await adminGet(path);
  if (!res.ok) throw new Error(`GET ${path} answered ${res.status}`);
  return ((await res.json()) as { events: LoggedEvent[] }).events;
}

export const fetchEvents = (gameId: string) =>
  events(`/admin/games/${encodeURIComponent(gameId)}/events`);

export const fetchRoomEvents = (roomId: string) =>
  events(`/admin/rooms/${encodeURIComponent(roomId)}/events`);

// The room id is in the host URL; the log tells which games ran in the room, oldest first.
export async function gameIdsOf(roomId: string): Promise<string[]> {
  const ids = (await fetchRoomEvents(roomId)).flatMap((e) =>
    e.gameId ? [e.gameId] : [],
  );
  return [...new Set(ids)];
}

export const adminStatus = async (path: string, token?: string) =>
  (await adminGet(path, token)).status;
