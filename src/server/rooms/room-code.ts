import type { Rng } from '../game/random.js';

export const ROOM_CODE_LENGTH = 6;

// A-Z and 2-9 without 0, O, 1 and I, which look alike when read aloud or
// typed on a phone.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

// Draws one rng value per character.
export function generateRoomCode(rng: Rng): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = Math.min(
      Math.floor(rng() * ROOM_CODE_ALPHABET.length),
      ROOM_CODE_ALPHABET.length - 1,
    );
    code += ROOM_CODE_ALPHABET[index];
  }
  return code;
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase();
}
