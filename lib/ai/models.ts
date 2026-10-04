import type { ModelRole } from './types';

/** Model ids come only from env (AD-09). Defaults are the documented ones. */
export function modelFor(role: ModelRole): string {
  if (role === 'extraction') return process.env.EXTRACTION_MODEL || 'claude-haiku-4-5-20251001';
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
}
