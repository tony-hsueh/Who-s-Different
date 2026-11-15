import { describe, expect, it } from 'vitest';
import { redact } from './redact.js';

describe('redact', () => {
  it('removes token and secret fields at any depth', () => {
    const result = redact({
      ok: 1,
      sessionToken: 'abc',
      hostToken: 'def',
      nested: { secretWord: 'cat', keep: 'x', deeper: [{ hostToken: 'z' }] },
      majorityWord: 'a',
      minorityWord: 'b',
      assignments: [{ playerId: 'p', role: 'minority' }],
    });
    expect(result).toEqual({
      ok: 1,
      nested: { keep: 'x', deeper: [{}] },
    });
  });

  it('does not change the input', () => {
    const input = { sessionToken: 'abc', n: 1 };
    redact(input);
    expect(input).toEqual({ sessionToken: 'abc', n: 1 });
  });
});
