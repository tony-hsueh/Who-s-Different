import { describe, expect, it } from 'vitest';
import { buildJoinUrl } from './join-url';

describe('buildJoinUrl', () => {
  it('joins the base url and the room code', () => {
    expect(buildJoinUrl('https://wd.example.com', 'ABC234')).toBe(
      'https://wd.example.com/room/ABC234',
    );
  });

  it('does not double the slash when the base ends with one', () => {
    expect(buildJoinUrl('http://192.168.1.5:3000/', 'ABC234')).toBe(
      'http://192.168.1.5:3000/room/ABC234',
    );
  });

  it('carries nothing but the room code (no query, no hash)', () => {
    const url = new URL(buildJoinUrl('http://192.168.1.5:3000', 'ABC234'));
    expect(url.search).toBe('');
    expect(url.hash).toBe('');
    expect(url.pathname).toBe('/room/ABC234');
  });
});
