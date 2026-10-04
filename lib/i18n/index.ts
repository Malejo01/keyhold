import type { Lang } from "../contracts";
import { en } from "./en";
import { es } from "./es";
import type { Dict } from "./types";

export type { Dict, Lang };
export const LANGS: readonly Lang[] = ["es", "en"];
export const DEFAULT_LANG: Lang = "en";

const dictionaries: Record<Lang, Dict> = { en, es };

export function isLang(value: string | undefined): value is Lang {
  return value === "en" || value === "es";
}

/** The whole dictionary for a language. Server and client code both call this (no i18n library). */
export function getDict(lang: Lang): Dict {
  return dictionaries[lang];
}

/** Locale used for number and date formatting. */
export const LOCALE: Record<Lang, string> = { en: "en-US", es: "es-AR" };

/**
 * Picks a route language from an Accept-Language header. The highest-ranked English or Spanish entry wins
 * (any `es*` variant is Spanish, any `en*` is English, ties keep header order); no header or no es/en entry means English.
 */
export function pickLang(acceptLanguage: string | null | undefined): Lang {
  if (!acceptLanguage) return DEFAULT_LANG;
  let best: { lang: Lang; q: number } | null = null;
  for (const part of acceptLanguage.split(",")) {
    const [tag = "", ...params] = part.trim().toLowerCase().split(";");
    const base = tag.trim().split("-")[0];
    if (base !== "es" && base !== "en") continue;
    const qParam = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
    const q = qParam ? Number.parseFloat(qParam.slice(2)) : 1;
    if (!Number.isFinite(q) || q <= 0) continue;
    if (!best || q > best.q) best = { lang: base, q };
  }
  return best?.lang ?? DEFAULT_LANG;
}
