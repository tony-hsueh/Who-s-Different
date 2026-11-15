import { describe, expect, it } from 'vitest';
import { createSeededRng } from '../game/random.js';
import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  generateRoomCode,
  normalizeRoomCode,
} from './room-code.js';

describe('generateRoomCode', () => {
  it('returns 6 characters', () => {
    expect(ROOM_CODE_LENGTH).toBe(6);
    expect(generateRoomCode(createSeededRng(1))).toHaveLength(6);
  });

  it('never uses the look-alike characters 0, O, 1, I', () => {
    for (const ch of '0O1I') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    const rng = createSeededRng(42);
    for (let i = 0; i < 2000; i++) {
      expect(generateRoomCode(rng)).toMatch(/^[^0O1I]{6}$/);
    }
  });

  it('only uses characters from the alphabet, at both ends of the rng range', () => {
    const chars = new Set([...generateRoomCode(() => 0)]);
    const top = new Set([...generateRoomCode(() => 0.9999999999)]);
    for (const ch of [...chars, ...top]) {
      expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it('is deterministic for the same rng seed', () => {
    expect(generateRoomCode(createSeededRng(9))).toBe(
      generateRoomCode(createSeededRng(9)),
    );
  });
});

describe('normalizeRoomCode', () => {
  it('trims and upper-cases what a player typed', () => {
    expect(normalizeRoomCode('  abc234 ')).toBe('ABC234');
  });
});
