"use client";

import { motion } from "framer-motion";
import type { Property } from "@/lib/contracts";
import { cardIn, stagger } from "@/lib/motion/presets";
import { formatMonthlyUsdc } from "../format";
import { useI18n } from "../I18nProvider";
import { PropertyArt } from "../PropertyArt";
import { BedIcon, Button, CardShell, PawIcon, PinIcon } from "../ui";

export function PropertyCards({
  properties,
  disabled,
  onVisit,
  confirmVisit = false,
  visitConfirmed = false,
  onConfirmVisit,
}: {
  properties: Property[];
  disabled: boolean;
  onVisit: (property: Property) => void;
  /** Card shown after picking a property: its button confirms the visit instead of booking again. */
  confirmVisit?: boolean;
  visitConfirmed?: boolean;
  onConfirmVisit?: () => void;
}) {
  const { lang, t } = useI18n();
  const c = t.cards.property;

  if (properties.length === 0) {
    return (
      <CardShell label={c.searchResults}>
        <p className="text-sm text-muted">{c.empty}</p>
      </CardShell>
    );
  }

  return (
    <motion.ul
      variants={stagger}
      initial="hidden"
      animate="show"
      aria-label={c.listLabel}
      className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3"
    >
      {properties.map((p) => {
        // The catalog carries both languages; the server may also send it already localized (then *Es is absent).
        const title = lang === "es" ? (p.titleEs ?? p.title) : p.title;
        const description = lang === "es" ? (p.descriptionEs ?? p.description) : p.description;
        return (
          <motion.li key={p.id} variants={cardIn} className="flex">
            <CardShell className="flex w-full flex-col gap-3 overflow-hidden" label={title}>
              <div className="-mx-card -mt-card overflow-hidden rounded-t-lg border-b border-border">
                <PropertyArt id={p.id} bedrooms={p.bedrooms} className="block h-28 w-full" />
              </div>
              <div>
                <h3 className="font-display text-base font-semibold leading-snug">{title}</h3>
                <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                  <PinIcon className="size-3.5" />
                  {p.zone}
                </p>
              </div>
              <p className="font-display text-xl font-semibold tabular-nums">
                {formatMonthlyUsdc(p.priceUsdc, lang)}
                <span className="text-sm font-normal text-muted">{c.perMonth}</span>
              </p>
              <ul className="flex flex-wrap gap-2 text-xs text-muted">
                <li className="inline-flex items-center gap-1 rounded-full bg-sunken px-2.5 py-1">
                  <BedIcon className="size-3.5" />
                  {c.bedrooms(p.bedrooms)}
                </li>
                {p.petsAllowed && (
                  <li className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-success">
                    <PawIcon className="size-3.5" />
                    {c.petsOk}
                  </li>
                )}
              </ul>
              <p className="line-clamp-3 text-sm text-muted">{description}</p>
              <Button
                variant="secondary"
                className="mt-auto w-full"
                disabled={disabled || (confirmVisit && visitConfirmed)}
                onClick={() => (confirmVisit ? onConfirmVisit?.() : onVisit(p))}
              >
                {confirmVisit ? (visitConfirmed ? c.visitConfirmed : c.confirmVisit) : c.bookVisit}
              </Button>
            </CardShell>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}
