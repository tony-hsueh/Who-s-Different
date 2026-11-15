import { createHash, timingSafeEqual } from 'node:crypto';
import type { RoomFailure } from '../../shared/room-types.js';

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type Entry = { hash: Buffer; roomId: string; expiresAt: number };
type PlayerEntry = Entry & { playerId: string };

export type PlayerSession = { ok: true; roomId: string; playerId: string };
export type HostSession = { ok: true; roomId: string };
export type TokenFailure = RoomFailure & {
  code: 'INVALID_TOKEN' | 'TOKEN_EXPIRED';
};

function sha256(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

// Only SHA-256 hashes of tokens are kept, so a memory dump does not leak
// usable tokens. Player and host tokens live in separate tables, so one kind
// never verifies as the other.
export class SessionRegistry {
  private readonly players = new Map<string, PlayerEntry>();
  private readonly hosts = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly ttlMs: number;

  constructor({
    now = Date.now,
    ttlMs = SESSION_TTL_MS,
  }: { now?: () => number; ttlMs?: number } = {}) {
    this.now = now;
    this.ttlMs = ttlMs;
  }

  registerPlayer(token: string, roomId: string, playerId: string): void {
    this.store(this.players, token, { roomId, playerId });
  }

  registerHost(token: string, roomId: string): void {
    this.store(this.hosts, token, { roomId });
  }

  verifyPlayer(token: string): PlayerSession | TokenFailure {
    const found = this.lookup(this.players, token);
    if (!found.ok) return found;
    return {
      ok: true,
      roomId: found.entry.roomId,
      playerId: found.entry.playerId,
    };
  }

  verifyHost(token: string): HostSession | TokenFailure {
    const found = this.lookup(this.hosts, token);
    if (!found.ok) return found;
    return { ok: true, roomId: found.entry.roomId };
  }

  removePlayer(playerId: string): void {
    for (const [key, entry] of this.players) {
      if (entry.playerId === playerId) this.players.delete(key);
    }
  }

  removeRoom(roomId: string): void {
    for (const table of this.tables()) {
      for (const [key, entry] of table) {
        if (entry.roomId === roomId) table.delete(key);
      }
    }
  }

  // Returns how many tokens were dropped.
  sweepExpired(now: number = this.now()): number {
    let dropped = 0;
    for (const table of this.tables()) {
      for (const [key, entry] of table) {
        if (entry.expiresAt <= now) {
          table.delete(key);
          dropped++;
        }
      }
    }
    return dropped;
  }

  private tables(): Map<string, Entry>[] {
    return [this.players, this.hosts];
  }

  private store<E extends Entry>(
    table: Map<string, E>,
    token: string,
    target: Omit<E, 'hash' | 'expiresAt'>,
  ): void {
    const hash = sha256(token);
    table.set(hash.toString('hex'), {
      ...target,
      hash,
      expiresAt: this.now() + this.ttlMs,
    } as E);
  }

  private lookup<E extends Entry>(
    table: Map<string, E>,
    token: string,
  ): { ok: true; entry: E } | TokenFailure {
    const hash = sha256(token);
    const entry = table.get(hash.toString('hex'));
    if (!entry || !timingSafeEqual(entry.hash, hash)) {
      return { ok: false, code: 'INVALID_TOKEN', message: 'Unknown token' };
    }
    if (entry.expiresAt <= this.now()) {
      return { ok: false, code: 'TOKEN_EXPIRED', message: 'Token has expired' };
    }
    return { ok: true, entry };
  }
}
