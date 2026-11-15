import { expect, it } from 'vitest';
import { ERROR_MESSAGES, errorMessage } from './errors';

it('has a non-empty Chinese message for every code', () => {
  for (const [code, message] of Object.entries(ERROR_MESSAGES)) {
    expect(message.length, code).toBeGreaterThan(0);
    expect(message, code).toMatch(/[\u4e00-\u9fff]/);
  }
});

it('looks a message up by code', () => {
  expect(errorMessage('ROOM_NOT_FOUND')).toBe(ERROR_MESSAGES.ROOM_NOT_FOUND);
});
