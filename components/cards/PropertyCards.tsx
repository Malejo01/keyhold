"use client";

import { motion } from "framer-motion";
import type { Property } from "@/lib/contracts";
import { cardIn, stagger } from "@/lib/motion/presets";
import { formatMonthlyUsdc } from "../format";
import { PropertyArt } from "../PropertyArt";
import { BedIcon, Button, CardShell, PawIcon, PinIcon } from "../ui";

export function PropertyCards({
  properties,
  disabled,
  onVisit,
}: {
  properties: Property[];
  disabled: boolean;
  onVisit: (property: Property) => void;
}) {
  if (properties.length === 0) {
    return (
      <CardShell label="Search results">
        <p className="text-sm text-muted">
          No matching properties in the catalog. Try a wider budget or zone.
        </p>
      </CardShell>
    );
  }

  return (
    <motion.ul
      variants={stagger}
      initial="hidden"
      animate="show"
      aria-label="Matching properties"
      className="grid grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3"
    >
      {properties.map((p) => (
        <motion.li key={p.id} variants={cardIn} className="flex">
          <CardShell className="flex w-full flex-col gap-3 overflow-hidden" label={p.title}>
            <div className="-mx-card -mt-card overflow-hidden rounded-t-lg border-b border-border">
              <PropertyArt id={p.id} bedrooms={p.bedrooms} className="block h-28 w-full" />
            </div>
            <div>
              <h3 className="font-display text-base font-semibold leading-snug">{p.title}</h3>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted">
                <PinIcon className="size-3.5" />
                {p.zone}
              </p>
            </div>
            <p className="font-display text-xl font-semibold tabular-nums">
              {formatMonthlyUsdc(p.priceUsdc)}
              <span className="text-sm font-normal text-muted"> / month</span>
            </p>
            <ul className="flex flex-wrap gap-2 text-xs text-muted">
              <li className="inline-flex items-center gap-1 rounded-full bg-sunken px-2.5 py-1">
                <BedIcon className="size-3.5" />
                {p.bedrooms} {p.bedrooms === 1 ? "bedroom" : "bedrooms"}
              </li>
              {p.petsAllowed && (
                <li className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-success">
                  <PawIcon className="size-3.5" />
                  Pets ok
                </li>
              )}
            </ul>
            <p className="line-clamp-3 text-sm text-muted">{p.description}</p>
            <Button
              variant="secondary"
              className="mt-auto w-full"
              disabled={disabled}
              onClick={() => onVisit(p)}
            >
              Book a visit
            </Button>
          </CardShell>
        </motion.li>
      ))}
    </motion.ul>
  );
}
