import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(
  new URL('../../src/client/ui/tokens.css', import.meta.url),
  'utf8',
);

function block(source: string, opener: RegExp): Record<string, string> {
  const start = source.search(opener);
  if (start < 0) return {};
  const open = source.indexOf('{', start);
  const close = source.indexOf('}', open);
  const tokens: Record<string, string> = {};
  for (const [, name, value] of source
    .slice(open, close)
    .matchAll(/--([\w-]+):\s*([^;]+);/g))
    tokens[name!] = value!.trim();
  return tokens;
}

const light = block(css, /:root\s*\{/);
const dark = {
  ...light,
  ...block(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root/),
};

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

// Text on background pairs the screens actually use: [text, background, minimum ratio].
// The reveal titles and winner banner are large bold text, where WCAG AA asks for 3:1.
const PAIRS: [string, string, number][] = [
  ['color-ink', 'color-bg', 4.5],
  ['color-ink', 'color-surface', 4.5],
  ['color-ink-soft', 'color-bg', 4.5],
  ['color-ink-soft', 'color-surface', 4.5],
  ['color-primary-ink', 'color-primary', 4.5],
  ['color-danger-ink', 'color-danger', 4.5],
  ['color-danger', 'color-bg', 4.5],
  ['color-danger', 'color-surface', 4.5],
  ['color-primary', 'color-bg', 4.5],
  ['color-tag-ink', 'color-tag', 4.5],
  ['color-success', 'color-bg', 3],
  ['color-success', 'color-success-tint', 3],
  ['color-danger', 'color-danger-tint', 3],
];

describe.each([
  ['light', light],
  ['dark', dark],
])('%s tokens meet WCAG AA for text', (_, tokens) => {
  it.each(PAIRS)('%s on %s (>= %s)', (fg, bg, min) => {
    const fgValue = tokens[fg];
    const bgValue = tokens[bg];
    expect(fgValue, fg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(bgValue, bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ratio(fgValue!, bgValue!)).toBeGreaterThanOrEqual(min);
  });
});

it('defines dark values for the color tokens', () => {
  expect(
    block(css, /@media \(prefers-color-scheme: dark\)\s*\{\s*:root/),
  ).toHaveProperty('color-bg');
});
