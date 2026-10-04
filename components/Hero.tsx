"use client";

import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
import { APP_NAME } from "@/lib/config/brand";
import { heroItem, heroStagger } from "@/lib/motion/presets";
import { HeroPreview } from "./HeroPreview";
import { useI18n } from "./I18nProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { Logo } from "./Logo";
import { FileIcon, PinIcon, ShieldIcon, cx } from "./ui";

const stepIcons: ReactNode[] = [
  <PinIcon key="pin" className="size-6" />,
  <ShieldIcon key="shield" className="size-6" />,
  <FileIcon key="file" className="size-6" />,
];

export function Hero({ targetId, query = "" }: { targetId: string; query?: string }) {
  const reduced = useReducedMotion();
  const { t } = useI18n();
  const steps = t.hero.steps.map((s, i) => ({ ...s, icon: stepIcons[i] }));

  function goToDemo() {
    const el = document.getElementById(targetId);
    const scroller = el?.closest("main");
    // Scroll only the page container (scrollIntoView would also shift the overflow-hidden body).
    if (el && scroller) {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop;
      scroller.scrollTo({ top, behavior: reduced ? "auto" : "smooth" });
    }
    window.setTimeout(() => document.getElementById("chat-input")?.focus({ preventScroll: true }), reduced ? 0 : 500);
  }

  return (
    <MotionConfig reducedMotion="user">
    <section aria-labelledby="hero-title" className="border-b border-border bg-surface">
      <motion.div
        variants={heroStagger}
        initial="hidden"
        animate="show"
        className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-gutter py-8 sm:py-12 lg:py-16"
      >
        <motion.div variants={heroItem} className="flex items-center justify-between gap-3">
          <Logo />
          <LanguageSwitcher query={query} />
        </motion.div>

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <div className="flex max-w-2xl flex-col gap-4">
          <motion.h1
            id="hero-title"
            variants={heroItem}
            className="font-display text-3xl font-bold leading-tight tracking-tight sm:text-5xl"
          >
            {t.hero.title}
          </motion.h1>
          <motion.p variants={heroItem} className="text-base text-muted sm:text-lg">
            {t.hero.intro(APP_NAME)}
          </motion.p>
          <motion.div variants={heroItem} className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={goToDemo}
              className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-md transition-colors hover:bg-primary-hover"
            >
              {t.hero.cta}
            </button>
            <span className="text-xs text-muted">{t.hero.ctaNote}</span>
          </motion.div>
        </div>
        <motion.div variants={heroItem}>
          <HeroPreview />
        </motion.div>
        </div>

        <motion.div variants={heroItem}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">{t.hero.howTitle}</h2>
          <ol className="grid gap-3 sm:grid-cols-3">
            {steps.map((s, i) => (
              <li
                key={s.title}
                className={cx("flex gap-3 rounded-lg border border-border bg-background p-4 sm:flex-col")}
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                  {s.icon}
                </span>
                <div>
                  <p className="font-display text-sm font-semibold">
                    <span className="text-accent">{i + 1}</span> {s.title}
                  </p>
                  <p className="mt-1 text-sm text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </motion.div>
      </motion.div>
    </section>
    </MotionConfig>
  );
}
