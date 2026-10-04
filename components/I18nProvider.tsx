"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { Lang } from "@/lib/contracts";
import { getDict, type Dict } from "@/lib/i18n";

interface I18n {
  lang: Lang;
  /** The dictionary for the route language. Missing keys are type errors (see lib/i18n/types.ts). */
  t: Dict;
}

const Ctx = createContext<I18n | null>(null);

/** Gives client components the route language and its dictionary without passing props down (functions cannot cross the server boundary). */
export function I18nProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  const value = useMemo(() => ({ lang, t: getDict(lang) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(Ctx);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>.");
  return value;
}
