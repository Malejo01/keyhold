import type { ModelRole } from './types';

export type ProviderName = 'gemini' | 'anthropic';

/** AI_PROVIDER=gemini|anthropic, default gemini (F0-11). Unknown values fall back to gemini. */
export function selectedProviderName(): ProviderName {
  return (process.env.AI_PROVIDER || '').trim().toLowerCase() === 'anthropic' ? 'anthropic' : 'gemini';
}

/**
 * Current stable Flash model per https://ai.google.dev/gemini-api/docs/models (checked 2026-10-03):
 * gemini-3.8-flash is the latest stable Flash. The default is the cheaper, faster Flash-Lite (AD-09): the model only
 * extracts fields and answers catalog questions, decisions live in lib/rules. Fallback if orchestration evals fail:
 * AI_MODEL=gemini-3.6-flash.
 */
export const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5-5';
export const ANTHROPIC_DEFAULT_EXTRACTION_MODEL = 'claude-haiku-4-5-20251001';

/** Model ids from another provider family are ignored, so a leftover `claude-*` env value cannot reach Gemini. */
function pick(family: ProviderName, candidates: (string | undefined)[], fallback: string): string {
  const other = family === 'gemini' ? /^claude/i : /^(gemini|models\/)/i;
  for (const c of candidates) {
    const v = c?.trim();
    if (v && !other.test(v)) return v;
  }
  return fallback;
}

/** Model ids come only from env (AD-09). Defaults depend on the provider. */
export function modelFor(role: ModelRole, provider: string = selectedProviderName()): string {
  const env = process.env;
  if (provider === 'gemini') {
    return role === 'extraction'
      ? pick('gemini', [env.EXTRACTION_MODEL, env.AI_MODEL], GEMINI_DEFAULT_MODEL)
      : pick('gemini', [env.AI_MODEL], GEMINI_DEFAULT_MODEL);
  }
  return role === 'extraction'
    ? pick('anthropic', [env.EXTRACTION_MODEL], ANTHROPIC_DEFAULT_EXTRACTION_MODEL)
    : pick('anthropic', [env.AI_MODEL, env.ANTHROPIC_MODEL], ANTHROPIC_DEFAULT_MODEL);
}
