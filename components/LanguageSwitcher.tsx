"use client";

import Link from "next/link";
import { LANGS } from "@/lib/i18n";
import { useI18n } from "./I18nProvider";
import { prepareLanguageSwitch, rememberLanguage } from "./langSwitch";
import { cx } from "./ui";

/**
 * Prominent ES | EN pill toggle. Each option is a plain link to the equivalent route (`/es`, `/en`), so it works
 * without JavaScript. On click we remember the choice in the `lang` cookie (read by the root redirect) and
 * prepare the saved demo for the other language (carry over before a lease, keep + notice after). Each segment
 * is at least 44 px tall. `query` carries the dev-only `?fixtures=1` flag across languages.
 */
export function LanguageSwitcher({
  query = "",
  className,
  fromChat = false,
}: {
  query?: string;
  className?: string;
  /** The toggle sits in the chat header: after switching, land on the chat instead of the hero. */
  fromChat?: boolean;
}) {
  const { lang, t } = useI18n();
  return (
    <nav aria-label={t.lang.groupLabel} className={className}>
      <ul className="inline-flex items-center rounded-full border border-border-strong bg-sunken p-0.5 text-sm font-bold">
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
                data-lang-option={code}
                onClick={() => {
                  rememberLanguage(code);
                  prepareLanguageSwitch(lang, code, fromChat);
                }}
                className={cx(
                  "flex min-h-11 min-w-12 items-center justify-center rounded-full px-3 uppercase tracking-wide transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted hover:bg-surface hover:text-foreground",
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
