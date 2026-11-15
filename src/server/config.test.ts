import { describe, expect, it } from 'vitest';
import { parsePublicBaseUrl } from './config.js';

describe('parsePublicBaseUrl', () => {
  it('returns null when unset or blank', () => {
    expect(parsePublicBaseUrl(undefined)).toBeNull();
    expect(parsePublicBaseUrl('  ')).toBeNull();
  });

  it('keeps an http(s) origin and drops a trailing slash', () => {
    expect(parsePublicBaseUrl('http://192.168.1.5:3000/')).toBe(
      'http://192.168.1.5:3000',
    );
    expect(parsePublicBaseUrl('https://wd.example.com')).toBe(
      'https://wd.example.com',
    );
  });

  it('rejects a path prefix, which the app is not served under', () => {
    expect(() => parsePublicBaseUrl('https://example.com/wd')).toThrow(
      /PUBLIC_BASE_URL/,
    );
  });

  it('rejects values that are not http(s) urls', () => {
    expect(() => parsePublicBaseUrl('not a url')).toThrow(/PUBLIC_BASE_URL/);
    expect(() => parsePublicBaseUrl('ftp://example.com')).toThrow(
      /PUBLIC_BASE_URL/,
    );
  });

  it('rejects urls that carry a query, hash or credentials', () => {
    expect(() => parsePublicBaseUrl('https://example.com/?a=1')).toThrow();
    expect(() => parsePublicBaseUrl('https://example.com/#x')).toThrow();
    expect(() => parsePublicBaseUrl('https://u:p@example.com')).toThrow();
  });
});
