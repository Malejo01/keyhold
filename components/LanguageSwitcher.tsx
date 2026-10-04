"use client";

import Link from "next/link";
import { LANGS } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";
import { cx } from "./ui";

/**
 * Visible ES | EN selector. Each option is a plain link to the equivalent route (`/es`, `/en`), so it works
 * without JavaScript and keeps the user on the same screen. The choice is also remembered in a cookie that
 * the root redirect reads next time. `query` carries the dev-only `?fixtures=1` flag across languages.
 */
export function LanguageSwitcher({ query = "", className }: { query?: string; className?: string }) {
  const { lang, t } = useI18n();
  return (
    <nav aria-label={t.lang.groupLabel} className={className}>
      <ul className="inline-flex rounded-full border border-border bg-sunken p-0.5 text-xs font-semibold">
        {LANGS.map((code) => {
          const active = code === lang;
          return (
            <li key={code}>
              <Link
                href={`/${code}${query}`}
                lang={code}
                hrefLang={code}
                aria-current={active ? "true" : undefined}
                aria-label={t.lang.switchTo[code]}
                title={t.lang.switchTo[code]}
                onClick={() => {
                  document.cookie = `lang=${code}; path=/; max-age=31536000; samesite=lax`;
                }}
                className={cx(
                  "block rounded-full px-2.5 py-1 uppercase tracking-wide transition-colors",
                  active ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {code}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
