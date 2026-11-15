// Every live connection of one identity (a player, or a room's host). Tracking
// a set of socket ids instead of one "current" id means a late disconnect from
// an old socket only removes itself and never hides a newer connection.
export type Presence = {
  socketIds: Set<string>;
  online: boolean;
  lastSeenAt: number;
};

export class PresenceTracker {
  private readonly entries = new Map<string, Presence>();

  constructor(private readonly now: () => number) {}

  connect(key: string, socketId: string): Presence {
    const entry = this.entries.get(key) ?? {
      socketIds: new Set<string>(),
      online: false,
      lastSeenAt: 0,
    };
    entry.socketIds.add(socketId);
    entry.online = true;
    entry.lastSeenAt = this.now();
    this.entries.set(key, entry);
    return entry;
  }

  disconnect(key: string, socketId: string): Presence | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.socketIds.delete(socketId);
    entry.online = entry.socketIds.size > 0;
    entry.lastSeenAt = this.now();
    return entry;
  }

  get(key: string): Presence | undefined {
    return this.entries.get(key);
  }

  isOnline(key: string): boolean {
    return this.entries.get(key)?.online ?? false;
  }

  forget(key: string): void {
    this.entries.delete(key);
  }
}
