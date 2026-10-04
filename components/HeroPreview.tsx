"use client";

import { APP_NAME } from "@/lib/config/brand";
import { useI18n } from "./I18nProvider";
import { AlertIcon, CheckIcon, ShieldIcon } from "./ui";

/** Decorative, static preview of the product (illustrative text only, no figures). Hidden from assistive tech. */
export function HeroPreview() {
  const { t } = useI18n();
  const pv = t.hero.preview;
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto hidden w-full max-w-md rotate-1 flex-col gap-3 rounded-xl border border-border bg-background p-4 shadow-lg lg:flex"
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <span className="font-semibold text-foreground">{APP_NAME}</span>
        <span className="rounded-full bg-sunken px-2 py-0.5">{pv.badge}</span>
      </div>
      <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
        {pv.user}
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border bg-surface px-3 py-2 text-sm">
        {pv.assistant}
      </div>

      <div className="rounded-lg border border-border bg-surface p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">{pv.prequal}</p>
        <div className="mt-2 flex flex-col items-stretch">
          <div className="flex items-center gap-2 rounded-md bg-sunken p-2 text-sm font-semibold">
            <CheckIcon className="size-4 text-success" strokeWidth={3} />
            {pv.first}
          </div>
          <div className="ml-4 h-4 w-0.5 bg-accent" />
          <div className="flex items-center gap-2 rounded-md bg-accent-soft p-2 text-sm font-semibold text-accent">
            <ShieldIcon className="size-4" />
            {pv.cross}
          </div>
        </div>
        <p className="mt-2 flex items-center gap-1.5 rounded-md bg-warning-soft p-2 text-xs font-medium text-warning">
          <AlertIcon className="size-4 shrink-0" />
          {pv.warning}
        </p>
      </div>
    </div>
  );
}
