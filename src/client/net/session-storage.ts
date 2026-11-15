// Tokens live in localStorage so a refresh keeps the seat. When storage is blocked
// (private mode, policy) they live in memory instead: play continues until the page reloads.
const memory = new Map<string, string>();

export const hostKey = (roomId: string) => `wd:host:${roomId}`;
export const playerKey = (roomCode: string) =>
  `wd:player:${roomCode.trim().toUpperCase()}`;

function save(key: string, token: string) {
  try {
    localStorage.setItem(key, token);
    memory.delete(key);
  } catch {
    memory.set(key, token);
  }
}

// The memory copy exists only while a write to storage has failed, so it wins over what storage returns.
function read(key: string): string | null {
  const fallback = memory.get(key);
  if (fallback !== undefined) return fallback;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function clear(key: string) {
  memory.delete(key);
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage is blocked, so there is nothing stored to remove.
  }
}

export const saveHostToken = (roomId: string, token: string) =>
  save(hostKey(roomId), token);
export const readHostToken = (roomId: string) => read(hostKey(roomId));
export const clearHostToken = (roomId: string) => clear(hostKey(roomId));

export const savePlayerToken = (roomCode: string, token: string) =>
  save(playerKey(roomCode), token);
export const readPlayerToken = (roomCode: string) => read(playerKey(roomCode));
export const clearPlayerToken = (roomCode: string) =>
  clear(playerKey(roomCode));
