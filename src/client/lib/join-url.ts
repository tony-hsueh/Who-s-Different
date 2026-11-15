// The only thing a player needs to find the room is its code, so nothing else goes into the link.
export function buildJoinUrl(baseUrl: string, roomCode: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/room/${encodeURIComponent(roomCode)}`;
}
