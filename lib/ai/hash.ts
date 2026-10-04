import { createHash } from 'node:crypto';

/** JSON with sorted object keys, so the same value always serializes the same way. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** Stable replay key for (agent, input). */
export function replayKey(agent: string, input: unknown): string {
  return createHash('sha256').update(stableStringify({ agent, input }), 'utf8').digest('hex');
}
