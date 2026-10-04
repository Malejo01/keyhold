"use client";

import { LayoutGroup, motion } from "framer-motion";
import type { TenantId } from "@/lib/contracts";
import { spring } from "@/lib/motion/presets";
import { PERSONAS } from "./types";
import { cx } from "./ui";

export function PersonaSwitcher({ value, onChange }: { value: TenantId; onChange: (id: TenantId) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span
        id="persona-label"
        className="hidden text-xs font-medium uppercase tracking-wide text-muted sm:inline"
      >
        Demo tenant
      </span>
      <LayoutGroup id="persona">
        <div
          role="radiogroup"
          aria-labelledby="persona-label"
          aria-label="Demo tenant"
          className="inline-flex rounded-full border border-border bg-sunken p-1"
        >
          {PERSONAS.map((p) => {
            const selected = p.id === value;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => !selected && onChange(p.id)}
                className={cx(
                  "relative rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors",
                  selected ? "text-primary-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {selected && (
                  <motion.span
                    layoutId="persona-pill"
                    transition={spring}
                    className="absolute inset-0 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
                <span className="relative">{p.name}</span>
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    </div>
  );
}
