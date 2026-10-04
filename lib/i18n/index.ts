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

/** Picks a route language from an Accept-Language header: any Spanish variant wins, everything else is English. */
export function pickLang(acceptLanguage: string | null | undefined): Lang {
  if (!acceptLanguage) return DEFAULT_LANG;
  const first = acceptLanguage.split(",")[0]?.trim().toLowerCase() ?? "";
  return first.startsWith("es") ? "es" : DEFAULT_LANG;
}
