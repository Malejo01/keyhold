/**
 * Deterministic person-name matching. No model involved.
 *
 * Normalization: strip accents, lowercase, treat punctuation (commas, dots, hyphens) as spaces,
 * collapse whitespace, drop Spanish connector particles. Token order is ignored, so
 * "TESTA FICTICIA, ANA LUCÍA" and "Ana Lucia Testa Ficticia" are the same person.
 */

const PARTICLES = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

export function nameTokens(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !PARTICLES.has(t));
}

export function normalizeName(name: string): string {
  return [...nameTokens(name)].sort().join(' ');
}

/**
 * Two names match when their token sets are equal, or when the shorter one has at least two tokens
 * and all of them appear in the longer one (a document may omit a middle name).
 */
export function namesMatch(a: string, b: string): boolean {
  const ta = new Set(nameTokens(a));
  const tb = new Set(nameTokens(b));
  if (ta.size === 0 || tb.size === 0) return false;
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  for (const t of small) if (!large.has(t)) return false;
  return small.size === large.size || small.size >= 2;
}
