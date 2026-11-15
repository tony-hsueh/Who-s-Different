import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearHostToken,
  clearPlayerToken,
  hostKey,
  playerKey,
  readHostToken,
  readPlayerToken,
  saveHostToken,
  savePlayerToken,
} from './session-storage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('keys', () => {
  it('are scoped by room', () => {
    expect(hostKey('r1')).toBe('wd:host:r1');
    expect(playerKey('ABCD')).toBe('wd:player:ABCD');
  });

  it('treat room codes case-insensitively', () => {
    expect(playerKey(' abcd ')).toBe('wd:player:ABCD');
  });
});

describe('with working localStorage', () => {
  it('saves, reads and clears a host token', () => {
    saveHostToken('r1', 'tok-h');
    expect(localStorage.getItem('wd:host:r1')).toBe('tok-h');
    expect(readHostToken('r1')).toBe('tok-h');
    expect(readHostToken('r2')).toBeNull();
    clearHostToken('r1');
    expect(readHostToken('r1')).toBeNull();
  });

  it('saves, reads and clears a player token', () => {
    savePlayerToken('abcd', 'tok-p');
    expect(localStorage.getItem('wd:player:ABCD')).toBe('tok-p');
    expect(readPlayerToken('ABCD')).toBe('tok-p');
    clearPlayerToken('ABCD');
    expect(readPlayerToken('abcd')).toBeNull();
  });
});

describe('when writes fail but reads work', () => {
  it('still returns the token that could not be stored', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    saveHostToken('quota-1', 'tok');
    expect(readHostToken('quota-1')).toBe('tok');
    clearHostToken('quota-1');
    expect(readHostToken('quota-1')).toBeNull();
  });
});

describe('with localStorage disabled', () => {
  function disableStorage() {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
  }

  it('never throws and keeps the token for this page load', () => {
    disableStorage();
    expect(() => saveHostToken('mem-1', 'tok')).not.toThrow();
    expect(readHostToken('mem-1')).toBe('tok');
    expect(() => clearHostToken('mem-1')).not.toThrow();
    expect(readHostToken('mem-1')).toBeNull();
    expect(readPlayerToken('NOPE')).toBeNull();
  });

  it('does not write the token to the console', () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map(
      (method) => vi.spyOn(console, method).mockImplementation(() => {}),
    );
    disableStorage();
    savePlayerToken('SECR', 'super-secret-token');
    readPlayerToken('SECR');
    clearPlayerToken('SECR');
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });
});
