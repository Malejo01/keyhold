"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Lang, PayResponse, PaymentKind, Property, SignedSession, Stage, TenantId } from "@/lib/contracts";
import { itemIn, messageIn, resetFade, stagger, typingDot, loop } from "@/lib/motion/presets";
import { createRealApi, fixtureApi, isStaleSession, type Api } from "./api-client";
import { CardRenderer, type CardContext } from "./cards/CardRenderer";
import { AgentActivity, AgentActivityCompact } from "./AgentActivity";
import { deriveActivity } from "./deriveAgents";
import Link from "next/link";
import { useI18n } from "./I18nProvider";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { CHIP_TEXT, BOOK_VISIT_FOR } from "@/lib/i18n/chips";
import { LeaseTimeline, LeaseTimelineCompact } from "./LeaseTimeline";
import { APP_NAME } from "@/lib/config/brand";
import { Logo } from "./Logo";
import {
  clearSwitchNotice,
  readPersisted,
  readSwitchNotice,
  storageKey,
  takeScrollHint,
  writePersisted,
} from "./langSwitch";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { UploadDocuments } from "./UploadDocuments";
import { CHIP_KEYS, PERSONAS, type ChatMessage, type PersistedDemo } from "./types";
import { AlertIcon, SendIcon, cx } from "./ui";

/** Index into CHIP_KEYS of the natural next step for each stage. */
const NEXT_CHIP: Record<Stage, number> = {
  SEARCH: 0,
  VISIT: 1,
  DOCUMENTS: 2,
  CONTRACT: 3,
  PAYMENT: 4,
  ACTIVE: 5,
  MOVE_OUT: 5,
};
let idCounter = 0;
const newId = () => `m${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function TypingIndicator() {
  const reduced = useReducedMotion();
  const { t } = useI18n();
  return (
    <motion.div
      variants={messageIn}
      initial="hidden"
      animate="show"
      className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3"
      role="status"
      aria-label={t.chat.typing(APP_NAME)}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          variants={typingDot}
          initial="idle"
          animate={loop(reduced, "active")}
          transition={{ delay: i * 0.15 }}
          className="block size-2 rounded-full bg-muted"
        />
      ))}
    </motion.div>
  );
}

export function ChatShell({ useFixtures, query = "" }: { useFixtures: boolean; query?: string }) {
  const { lang, t } = useI18n();
  const api: Api = useMemo(() => (useFixtures ? fixtureApi : createRealApi(lang, t.errors)), [useFixtures, lang, t]);
  const reduced = useReducedMotion();
  const storeKey = storageKey(lang);

  const [tenantId, setTenantId] = useState<TenantId>("ana");
  const [session, setSession] = useState<SignedSession | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<Stage>("SEARCH");
  const [pending, setPending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);
  /** Set when the user just switched language away from a demo that already has a lease or payments. */
  const [switchNotice, setSwitchNotice] = useState<{ from: Lang } | null>(null);

  const sessionRef = useRef<SignedSession | undefined>(undefined);
  const tenantRef = useRef<TenantId>("ana");
  /** Bumped on every reset so late responses from a previous persona are ignored. */
  const epochRef = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const generatingRef = useRef(false);
  const chipsRef =useRef<HTMLUListElement>(null);

  // Restore from sessionStorage after mount (reading it during render would cause hydration mismatches).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = readPersisted(storeKey);
    if (saved) {
      setTenantId(saved.tenantId);
      tenantRef.current = saved.tenantId;
      setSession(saved.session);
      sessionRef.current = saved.session;
      setMessages(saved.messages);
      setStage(saved.stage);
    }
    // The notice only makes sense on an empty conversation; otherwise this language already has its own demo.
    if (saved && saved.messages.length > 0) clearSwitchNotice();
    else setSwitchNotice(readSwitchNotice(lang));
    if (takeScrollHint()) document.getElementById("demo")?.scrollIntoView({ block: "start" });
    setHydrated(true);
  }, [storeKey, lang]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    writePersisted(storeKey, { tenantId, session, messages, stage });
  }, [hydrated, storeKey, tenantId, session, messages, stage]);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduced ? "auto" : "smooth" });
  }, [messages, pending, reduced]);

  const applySession = useCallback((next: SignedSession) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const append = useCallback((msg: Omit<ChatMessage, "id">) => {
    setMessages((prev) => [...prev, { ...msg, id: newId() }]);
  }, []);

  /**
   * The server refused the session as out of date (a replayed or duplicated tab). Reloading would restore the same
   * stale blob from sessionStorage and loop, so drop it: the demo restarts with the same tenant.
   */
  const resetStaleSession = useCallback(() => {
    epochRef.current += 1;
    sessionRef.current = undefined;
    setSession(undefined);
    setMessages([{ id: newId(), role: "assistant", error: true, text: t.chat.staleReset }]);
    setStage("SEARCH");
    setPending(false);
    generatingRef.current = false;
    setGenerating(false);
    setDraft("");
  }, [t]);

  const dismissNotice = useCallback(() => {
    clearSwitchNotice();
    setSwitchNotice(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || pending) return;
      const epoch = epochRef.current;
      append({ role: "user", text: message });
      dismissNotice();
      setDraft("");
      setPending(true);
      try {
        const res = await api.chat({ message, session: sessionRef.current, tenantId: tenantRef.current });
        if (epoch !== epochRef.current) return;
        applySession(res.session);
        setStage(res.stage);
        append({ role: "assistant", text: res.reply, cards: res.cards });
      } catch (err) {
        if (epoch !== epochRef.current) return;
        if (isStaleSession(err)) {
          resetStaleSession();
          return;
        }
        append({
          role: "assistant",
          error: true,
          text: err instanceof Error ? err.message : t.chat.genericError,
        });
      } finally {
        if (epoch === epochRef.current) setPending(false);
      }
    },
    [api, append, applySession, dismissNotice, pending, resetStaleSession, t],
  );

  /** Real files for the DOCUMENTS stage: same turn lifecycle as `send`, via /api/upload. */
  const uploadFiles = useCallback(
    async (files: File[]) => {
      const current = sessionRef.current;
      if (files.length === 0 || pending || !current) return;
      const epoch = epochRef.current;
      append({ role: "user", text: t.chat.uploaded(files.map((f) => f.name).join(", ")) });
      setPending(true);
      try {
        const res = await api.upload({ files, session: current });
        if (epoch !== epochRef.current) return;
        applySession(res.session);
        setStage(res.stage);
        append({ role: "assistant", text: res.reply, cards: res.cards });
      } catch (err) {
        if (epoch !== epochRef.current) return;
        append({
          role: "assistant",
          error: true,
          text: err instanceof Error ? err.message : t.chat.genericError,
        });
      } finally {
        if (epoch === epochRef.current) setPending(false);
      }
    },
    [api, append, applySession, pending, t],
  );

  const changePersona = useCallback((id: TenantId) => {
    epochRef.current += 1;
    tenantRef.current = id;
    sessionRef.current = undefined;
    setTenantId(id);
    setSession(undefined);
    setMessages([]);
    setStage("SEARCH");
    setPending(false);
    generatingRef.current = false;
    setGenerating(false);
    setDraft("");
    dismissNotice();
    inputRef.current?.focus();
  }, [dismissNotice]);

  // Shared by the server-signed button and the Solana Pay QR flow: both end with a PayResponse.
  const applyPaid = useCallback(
    (res: PayResponse) => {
      applySession(res.session);
      setStage(res.session.state.stage);
      append({
        role: "assistant",
        text: res.result.kind === "deposit" ? t.chat.depositConfirmed : t.chat.rentConfirmed,
        cards: [{ type: "receipt", result: res.result }],
      });
    },
    [append, applySession, t],
  );

  const pay = useCallback(
    async (kind: PaymentKind) => {
      const current = sessionRef.current;
      if (!current) throw new Error(t.chat.startFirst);
      const epoch = epochRef.current;
      let res;
      try {
        res = await api.pay({ kind, session: current });
      } catch (err) {
        if (epoch === epochRef.current && isStaleSession(err)) {
          resetStaleSession();
          return;
        }
        throw err;
      }
      if (epoch !== epochRef.current) return;
      applyPaid(res);
    },
    [api, applyPaid, resetStaleSession, t],
  );

  // Same path as the "Generate the contract" chip, so the reply carries contract + deposit cards.
  const generateContract = useCallback(async () => {
    if (generatingRef.current || pending) return;
    const epoch = epochRef.current;
    generatingRef.current = true;
    setGenerating(true);
    try {
      await send(CHIP_TEXT[lang][3]);
    } finally {
      generatingRef.current = false;
      if (epoch === epochRef.current) setGenerating(false);
    }
  }, [pending, send, lang]);

  const ctx: CardContext = useMemo(
    () => ({
      payments: session?.state.payments ?? [],
      hasLease: Boolean(session?.state.lease),
      busy: pending,
      generatingContract: generating,
      onVisit: (p: Property) => void send(`${BOOK_VISIT_FOR[lang]} ${lang === "es" ? (p.titleEs ?? p.title) : p.title}`),
      onPay: pay,
      getSession: () => sessionRef.current,
      onPaid: applyPaid,
      onVerify: (contractText, signature) => api.verify({ contractText, signature }),
      onGenerateContract: () => void generateContract(),
    }),
    [session, pending, generating, send, pay, applyPaid, generateContract, api, lang],
  );

  // Highlight the chip for the natural next step and keep it reachable in the scrolling mobile row.
  const depositPaid = (session?.state.payments ?? []).some((p) => p.kind === "deposit");
  const nextChip = Math.min(
    stage === "PAYMENT" && depositPaid ? 5 : NEXT_CHIP[stage],
    CHIP_KEYS.length - 1,
  );
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.querySelector<HTMLElement>("[data-next='true']");
    if (!row || !chip) return;
    row.scrollTo({
      left: chip.offsetLeft - row.offsetLeft - 8,
      behavior: reduced ? "auto" : "smooth",
    });
  }, [nextChip, reduced, tenantId]);

  const agentRows = useMemo(() => deriveActivity(messages, pending, stage, t), [messages, pending, stage, t]);
  const personaName = PERSONAS.find((p) => p.id === tenantId)?.name ?? "";

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid min-h-0 w-full flex-1 grid-rows-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Chat column */}
        <section aria-label={t.chat.region} className="flex min-h-0 min-w-0 flex-col">
          <header className="border-b border-border px-gutter py-3">
            <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Logo />
              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                <Link href={`/${lang}/agency`} className="text-sm font-semibold text-accent underline underline-offset-2">
                  {t.hero.agencyLink}
                </Link>
                <PersonaSwitcher value={tenantId} onChange={changePersona} />
                <LanguageSwitcher query={query} fromChat />
              </div>
            </div>
          </header>

          <div className="border-b border-border px-gutter py-3 lg:hidden">
            <LeaseTimelineCompact stage={stage} />
            <div className="mt-3">
              <AgentActivityCompact rows={agentRows} />
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tenantId}
              variants={resetFade}
              initial="initial"
              animate="animate"
              exit="exit"
              ref={listRef}
              role="log"
              aria-live="polite"
              aria-relevant="additions"
              aria-label={t.chat.conversation}
              className="scroll-thin min-h-0 flex-1 overflow-y-auto px-gutter py-5"
            >
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4">
                {switchNotice && messages.length === 0 && (
                  <div
                    role="status"
                    className="mx-auto w-full max-w-md rounded-xl border border-border-strong bg-primary-soft px-4 py-3 text-sm"
                  >
                    <p>
                      <span className="font-semibold">{t.lang.noticeTitle}</span>{" "}
                      {t.lang.notice(t.lang.names[switchNotice.from])}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        dismissNotice();
                        inputRef.current?.focus();
                      }}
                      className="mt-3 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
                    >
                      {t.lang.startOver(t.lang.names[lang])}
                    </button>
                  </div>
                )}

                {messages.length === 0 && (
                  <div className="my-auto mx-auto max-w-md py-8 text-center">
                    <p className="font-display text-xl font-semibold">{t.chat.greeting(personaName, APP_NAME)}</p>
                    <p className="mt-2 text-sm text-muted">{t.chat.intro}</p>
                  </div>
                )}

                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    variants={messageIn}
                    initial="hidden"
                    animate="show"
                    className={cx("flex flex-col gap-3", m.role === "user" ? "items-end" : "items-start")}
                  >
                    <div
                      className={cx(
                        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed sm:max-w-[75%]",
                        m.role === "user" && "rounded-br-sm bg-primary text-primary-foreground",
                        m.role === "assistant" &&
                          !m.error &&
                          "rounded-bl-sm border border-border bg-surface text-foreground",
                        m.error && "rounded-bl-sm border border-danger bg-danger-soft text-danger",
                      )}
                    >
                      {m.error && (
                        <span className="flex items-start gap-2">
                          <AlertIcon className="mt-0.5 size-4 shrink-0" />
                          <span>
                            <span className="sr-only">{t.chat.errorPrefix}</span>
                            {m.text}
                          </span>
                        </span>
                      )}
                      {!m.error && m.text}
                    </div>
                    {m.cards && m.cards.length > 0 && (
                      <motion.div
                        variants={stagger}
                        initial="hidden"
                        animate="show"
                        className="flex w-full flex-col gap-3"
                      >
                        {m.cards.map((card, i) => (
                          <CardRenderer key={`${m.id}-${i}`} card={card} ctx={ctx} />
                        ))}
                      </motion.div>
                    )}
                  </motion.div>
                ))}

                {pending && <TypingIndicator />}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Composer */}
          <div className="border-t border-border bg-background px-gutter pb-3 pt-3">
            <div className="mx-auto w-full max-w-3xl">
              {stage === "DOCUMENTS" && session && <UploadDocuments busy={pending} onSubmit={(f) => void uploadFiles(f)} />}
              <motion.ul
                variants={stagger}
                initial="hidden"
                animate="show"
                aria-label={t.chat.suggested}
                ref={chipsRef}
                className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1 pr-8 [mask-image:linear-gradient(to_right,black_88%,transparent)] sm:flex-wrap sm:overflow-visible sm:pr-0 sm:[mask-image:none]"
              >
                {CHIP_KEYS.map((key, i) => (
                  <motion.li key={key} variants={itemIn} className="shrink-0">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void send(CHIP_TEXT[lang][i])}
                      title={CHIP_TEXT[lang][i]}
                      data-next={i === nextChip ? "true" : undefined}
                      className={cx(
                        "rounded-full border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50",
                        i === nextChip
                          ? "border-primary text-primary"
                          : "border-border-strong text-foreground",
                      )}
                    >
                      {t.chips[key].label}
                    </button>
                  </motion.li>
                ))}
              </motion.ul>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send(draft);
                }}
                className="flex items-center gap-2"
              >
                <label htmlFor="chat-input" className="sr-only">
                  {t.chat.inputLabel}
                </label>
                <input
                  id="chat-input"
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoComplete="off"
                  placeholder={t.chat.placeholder}
                  className="min-w-0 flex-1 rounded-full border border-border-strong bg-surface px-4 py-2.5 text-sm placeholder:text-subtle"
                />
                <button
                  type="submit"
                  disabled={pending || draft.trim().length === 0}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <SendIcon className="size-5" />
                  <span className="sr-only">{t.chat.send}</span>
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Timeline column (desktop) */}
        <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface px-6 py-5 lg:flex">
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
              {t.chat.timelineTitle}
            </h2>
            <p className="mt-1 text-xs text-subtle">{t.chat.timelineHint}</p>
          </div>
          <LeaseTimeline stage={stage} />
          <AgentActivity rows={agentRows} className="border-t border-border pt-4" />
          <p className="mt-auto text-xs text-subtle">{t.chat.footnote}</p>
        </aside>
      </div>
    </MotionConfig>
  );
}
