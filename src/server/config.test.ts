import { describe, expect, it } from 'vitest';
import { parsePublicBaseUrl, resolvePublicBaseUrl } from './config.js';

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

describe('resolvePublicBaseUrl', () => {
  it('prefers PUBLIC_BASE_URL over the Render url', () => {
    expect(
      resolvePublicBaseUrl({
        PUBLIC_BASE_URL: 'https://game.example.com/',
        RENDER_EXTERNAL_URL: 'https://wd.onrender.com',
      }),
    ).toBe('https://game.example.com');
  });

  it('falls back to RENDER_EXTERNAL_URL so the QR code uses the public Render url', () => {
    expect(
      resolvePublicBaseUrl({ RENDER_EXTERNAL_URL: 'https://wd.onrender.com' }),
    ).toBe('https://wd.onrender.com');
    expect(
      resolvePublicBaseUrl({
        PUBLIC_BASE_URL: '  ',
        RENDER_EXTERNAL_URL: 'https://wd.onrender.com',
      }),
    ).toBe('https://wd.onrender.com');
  });

  it('returns null when neither is set', () => {
    expect(resolvePublicBaseUrl({})).toBeNull();
  });

  it('still rejects a bad PUBLIC_BASE_URL instead of silently using Render', () => {
    expect(() =>
      resolvePublicBaseUrl({
        PUBLIC_BASE_URL: 'https://example.com/wd',
        RENDER_EXTERNAL_URL: 'https://wd.onrender.com',
      }),
    ).toThrow(/PUBLIC_BASE_URL/);
  });
});
