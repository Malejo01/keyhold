// Pure memo helpers for the agency panel. No I/O, no PII: a memo only ever carries an opaque lease id,
// a month number and sha256 hashes (see the memo convention in lib/contracts.ts).

export type LeaseMemoKind = "deposit" | "rent" | "release";

export interface ParsedLeaseMemo {
  leaseId: string;
  kind: LeaseMemoKind;
  /** Only for kind "rent". */
  monthIndex?: number;
  /** deposit/rent: sha256 of the contract text. release: sha256 of the release reason text. */
  hash: string;
  /** True for the `tuki:lease:` prefix used before 2026-10-04. */
  legacy: boolean;
}

const ID = "[A-Za-z0-9_-]+";
const HASH = "[0-9a-f]{64}";
const MEMO_RE = new RegExp(
  `^(lease:v1|tuki:lease):(${ID}):(?:(deposit):(${HASH})|(rent):([0-9]{1,4}):(${HASH})|(release):(${HASH}))$`,
);
export const ID_RE = new RegExp(`^${ID}$`);
export const HASH_RE = new RegExp(`^${HASH}$`);

/**
 * Parses one memo string. Returns null for anything that is not an exact lease memo.
 * `release` exists only with the current prefix (it was introduced after the rename).
 */
export function parseLeaseMemo(memo: string): ParsedLeaseMemo | null {
  const m = MEMO_RE.exec(memo.trim());
  if (!m) return null;
  const legacy = m[1] === "tuki:lease";
  const leaseId = m[2];
  if (m[3]) return { leaseId, kind: "deposit", hash: m[4], legacy };
  if (m[5]) return { leaseId, kind: "rent", monthIndex: Number(m[6]), hash: m[7], legacy };
  if (legacy) return null;
  return { leaseId, kind: "release", hash: m[9], legacy };
}

/**
 * `getSignaturesForAddress` returns memos as `[<byte length>] <text>`, several memos joined by `; `.
 * Returns the first lease memo found, or null.
 */
export function extractLeaseMemo(raw: string | null | undefined): ParsedLeaseMemo | null {
  if (!raw) return null;
  for (const part of raw.split("; ")) {
    const parsed = parseLeaseMemo(part.replace(/^\[\d+\]\s*/, ""));
    if (parsed) return parsed;
  }
  return null;
}

/** `lease:v1:<leaseId>:release:<reasonSha256>`. Rejects anything that could carry free text. */
export function buildReleaseMemo(leaseId: string, reasonHash: string): string {
  if (!ID_RE.test(leaseId)) throw new Error("Invalid leaseId for memo.");
  if (!HASH_RE.test(reasonHash)) throw new Error("Invalid reason hash for memo (expected 64 hex chars).");
  return `lease:v1:${leaseId}:release:${reasonHash}`;
}
