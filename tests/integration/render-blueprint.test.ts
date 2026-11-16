import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// render.yaml has no parser in this repo, so check the lines that decide cost and reachability.
const blueprint = readFileSync(
  new URL('../../render.yaml', import.meta.url),
  'utf8',
);
const field = (name: string) =>
  blueprint.match(new RegExp(`^\\s+${name}:\\s*(\\S+)`, 'm'))?.[1];

describe('render.yaml', () => {
  it('declares exactly one Docker web service', () => {
    expect(blueprint.match(/^\s+- type:/gm)).toHaveLength(1);
    expect(field('- type')).toBe('web');
    expect(field('runtime')).toBe('docker');
  });

  it('stays on the free plan in Singapore', () => {
    // Without plan: free, Render picks a paid instance type.
    expect(field('plan')).toBe('free');
    expect(field('region')).toBe('singapore');
  });

  it('health-checks the route the server actually serves', () => {
    expect(field('healthCheckPath')).toBe('/healthz');
  });

  it('pins PORT to the one the Dockerfile exposes', () => {
    const dockerfile = readFileSync(
      new URL('../../Dockerfile', import.meta.url),
      'utf8',
    );
    const exposed = dockerfile.match(/^EXPOSE (\d+)/m)?.[1];
    expect(blueprint).toMatch(
      new RegExp(`key: PORT\\s+value: ['"]?${exposed}['"]?`),
    );
  });

  it('generates ADMIN_TOKEN instead of committing one', () => {
    expect(blueprint).toMatch(/key: ADMIN_TOKEN\s+generateValue: true/);
  });

  it('does not hard-code PUBLIC_BASE_URL, so the server uses the onrender.com url', () => {
    expect(blueprint).not.toMatch(/key: PUBLIC_BASE_URL/);
  });
});
