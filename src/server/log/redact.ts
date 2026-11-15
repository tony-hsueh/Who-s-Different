// Fields that must never reach the ordinary event table. The words and the
// role assignment only belong in game_private_records.
const FORBIDDEN_KEYS = new Set([
  'sessionToken',
  'hostToken',
  'secretWord',
  'majorityWord',
  'minorityWord',
  'assignments',
]);

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !FORBIDDEN_KEYS.has(key))
        .map(([key, inner]) => [key, strip(inner)]),
    );
  }
  return value;
}

export function redact(payload: Record<string, unknown>) {
  return strip(payload) as Record<string, unknown>;
}
