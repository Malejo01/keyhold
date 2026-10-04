import type { Lang } from "@/lib/contracts";
import type { PersistedDemo } from "./types";

/** One saved conversation per language: the contract text (and its hash) is language-specific. */
export const storageKey = (lang: Lang) => `demo.session.v2.${lang}`;
/** One-shot hint for the destination page: "your demo in <from> is saved". */
const NOTICE_KEY = "demo.langnotice.v1";
/** One-shot hint: the switch started from the chat section, so land there instead of on the hero. */
const SCROLL_KEY = "demo.langscroll.v1";

export function readPersisted(key: string): PersistedDemo | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as PersistedDemo) : null;
  } catch {
    return null;
  }
}

export function writePersisted(key: string, value: PersistedDemo | null) {
  try {
    if (value) window.sessionStorage.setItem(key, JSON.stringify(value));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage can be unavailable (private mode); the demo still works in memory.
  }
}

/** True once the conversation holds a lease/contract or a payment: its contract hash is tied to its language. */
export function isLocked(demo: PersistedDemo | null): boolean {
  const state = demo?.session?.state;
  return Boolean(state?.lease) || (state?.payments?.length ?? 0) > 0;
}

/**
 * Called right before navigating from `from` to `to`.
 * - Conversation already has a lease or payments: it stays under the old language and the new page shows a notice.
 * - Earlier stage (search, visit, documents): the conversation is re-keyed to the new language, messages and all.
 * - The destination already has its own conversation: it is never overwritten.
 */
export function prepareLanguageSwitch(from: Lang, to: Lang, fromChat: boolean): void {
  if (from === to) return;
  try {
    window.sessionStorage.removeItem(NOTICE_KEY);
    if (fromChat) window.sessionStorage.setItem(SCROLL_KEY, "1");
    const current = readPersisted(storageKey(from));
    if (!current || current.messages.length === 0) return;
    const destination = readPersisted(storageKey(to));
    if (isLocked(current)) {
      if (!destination || destination.messages.length === 0) {
        window.sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ from, to }));
      }
      return;
    }
    if (!destination || (destination.messages.length === 0 && !isLocked(destination))) {
      writePersisted(storageKey(to), current);
      writePersisted(storageKey(from), null);
    }
  } catch {
    // Storage unavailable: the switch just starts fresh.
  }
}

/** Notice for the page in `lang`, if the user just left a locked demo in another language. */
export function readSwitchNotice(lang: Lang): { from: Lang } | null {
  try {
    const raw = window.sessionStorage.getItem(NOTICE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { from: Lang; to: Lang };
    return parsed.to === lang ? { from: parsed.from } : null;
  } catch {
    return null;
  }
}

export function clearSwitchNotice(): void {
  try {
    window.sessionStorage.removeItem(NOTICE_KEY);
  } catch {
    // ignore
  }
}

/** Consumes the one-shot "land on the chat" hint. */
export function takeScrollHint(): boolean {
  try {
    const hit = window.sessionStorage.getItem(SCROLL_KEY) === "1";
    window.sessionStorage.removeItem(SCROLL_KEY);
    return hit;
  } catch {
    return false;
  }
}

/** Remembers the choice for the root redirect: 1 year, SameSite=Lax, whole site. */
export function rememberLanguage(lang: Lang): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `lang=${lang}; path=/; max-age=31536000; samesite=lax${secure}`;
}
