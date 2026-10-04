"use client";

import { AnimatePresence, MotionConfig, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PaymentKind, Property, SignedSession, Stage, TenantId } from "@/lib/contracts";
import { itemIn, messageIn, resetFade, stagger, typingDot, loop } from "@/lib/motion/presets";
import { fixtureApi, realApi, type Api } from "./api-client";
import { CardRenderer, type CardContext } from "./cards/CardRenderer";
import { AgentActivity, AgentActivityCompact } from "./AgentActivity";
import { deriveActivity } from "./deriveAgents";
import { LeaseTimeline, LeaseTimelineCompact } from "./LeaseTimeline";
import { APP_NAME } from "@/lib/config/brand";
import { Logo } from "./Logo";
import { PersonaSwitcher } from "./PersonaSwitcher";
import { PERSONAS, SUGGESTED_PROMPTS, type ChatMessage, type PersistedDemo } from "./types";
import { AlertIcon, SendIcon, cx } from "./ui";

const STORAGE_KEY = "demo.session.v2";
/** Index into SUGGESTED_PROMPTS of the natural next step for each stage. */
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

function readPersisted(): PersistedDemo | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedDemo) : null;
  } catch {
    return null;
  }
}

function writePersisted(value: PersistedDemo | null) {
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable (private mode); the demo still works in memory.
  }
}

function TypingIndicator() {
  const reduced = useReducedMotion();
  return (
    <motion.div
      variants={messageIn}
      initial="hidden"
      animate="show"
      className="flex w-fit items-center gap-1.5 rounded-2xl rounded-bl-sm border border-border bg-surface px-4 py-3"
      role="status"
      aria-label={`${APP_NAME} is typing`}
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

export function ChatShell({ useFixtures }: { useFixtures: boolean }) {
  const api: Api = useFixtures ? fixtureApi : realApi;
  const reduced = useReducedMotion();

  const [tenantId, setTenantId] = useState<TenantId>("ana");
  const [session, setSession] = useState<SignedSession | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<Stage>("SEARCH");
  const [pending, setPending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState("");
  const [hydrated, setHydrated] = useState(false);

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
    const saved = readPersisted();
    if (saved) {
      setTenantId(saved.tenantId);
      tenantRef.current = saved.tenantId;
      setSession(saved.session);
      sessionRef.current = saved.session;
      setMessages(saved.messages);
      setStage(saved.stage);
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!hydrated) return;
    writePersisted({ tenantId, session, messages, stage });
  }, [hydrated, tenantId, session, messages, stage]);

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

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || pending) return;
      const epoch = epochRef.current;
      append({ role: "user", text: message });
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
        append({
          role: "assistant",
          error: true,
          text: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        });
      } finally {
        if (epoch === epochRef.current) setPending(false);
      }
    },
    [api, append, applySession, pending],
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
    inputRef.current?.focus();
  }, []);

  const pay = useCallback(
    async (kind: PaymentKind) => {
      const current = sessionRef.current;
      if (!current) throw new Error("Start the conversation first.");
      const epoch = epochRef.current;
      const res = await api.pay({ kind, session: current });
      if (epoch !== epochRef.current) return;
      applySession(res.session);
      setStage(res.session.state.stage);
      append({
        role: "assistant",
        text: res.result.kind === "deposit" ? "Deposit payment confirmed." : "Rent payment confirmed.",
        cards: [{ type: "receipt", result: res.result }],
      });
    },
    [api, append, applySession],
  );

  // Same path as the "Generate the contract" chip, so the reply carries contract + deposit cards.
  const generateContract = useCallback(async () => {
    if (generatingRef.current || pending) return;
    const epoch = epochRef.current;
    generatingRef.current = true;
    setGenerating(true);
    try {
      await send("Generate the contract");
    } finally {
      generatingRef.current = false;
      if (epoch === epochRef.current) setGenerating(false);
    }
  }, [pending, send]);

  const ctx: CardContext = useMemo(
    () => ({
      payments: session?.state.payments ?? [],
      hasLease: Boolean(session?.state.lease),
      busy: pending,
      generatingContract: generating,
      onVisit: (p: Property) => void send(`Book a visit for ${p.title}`),
      onPay: pay,
      onVerify: (contractText, signature) => api.verify({ contractText, signature }),
      onGenerateContract: () => void generateContract(),
    }),
    [session, pending, generating, send, pay, generateContract, api],
  );

  // Highlight the chip for the natural next step and keep it reachable in the scrolling mobile row.
  const depositPaid = (session?.state.payments ?? []).some((p) => p.kind === "deposit");
  const nextChip = Math.min(
    stage === "PAYMENT" && depositPaid ? 5 : NEXT_CHIP[stage],
    SUGGESTED_PROMPTS.length - 1,
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

  const agentRows = useMemo(() => deriveActivity(messages, pending, stage), [messages, pending, stage]);
  const personaName =PERSONAS.find((p) => p.id === tenantId)?.name ?? "";

  return (
    <MotionConfig reducedMotion="user">
      <div className="grid min-h-0 w-full flex-1 grid-rows-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Chat column */}
        <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-col">
          <header className="border-b border-border px-gutter py-3">
            <div className="mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <Logo />
              <PersonaSwitcher value={tenantId} onChange={changePersona} />
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
              aria-label="Conversation"
              className="scroll-thin min-h-0 flex-1 overflow-y-auto px-gutter py-5"
            >
              <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4">
                {messages.length === 0 && (
                  <div className="my-auto mx-auto max-w-md py-8 text-center">
                    <p className="font-display text-xl font-semibold">Hi {personaName}, I&apos;m {APP_NAME}.</p>
                    <p className="mt-2 text-sm text-muted">
                      I find rentals, check your documents, prepare the contract and take the deposit.
                      Tell me what you are looking for, or pick a suggestion below.
                    </p>
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
                            <span className="sr-only">Error: </span>
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
              <motion.ul
                variants={stagger}
                initial="hidden"
                animate="show"
                aria-label="Suggested prompts"
                ref={chipsRef}
                className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1 pr-8 [mask-image:linear-gradient(to_right,black_88%,transparent)] sm:flex-wrap sm:overflow-visible sm:pr-0 sm:[mask-image:none]"
              >
                {SUGGESTED_PROMPTS.map((p, i) => (
                  <motion.li key={p.label} variants={itemIn} className="shrink-0">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => void send(p.text)}
                      title={p.text}
                      data-next={i === nextChip ? "true" : undefined}
                      className={cx(
                        "rounded-full border bg-surface px-3 py-1.5 text-xs font-medium transition-colors hover:bg-primary-soft hover:text-primary disabled:cursor-not-allowed disabled:opacity-50",
                        i === nextChip
                          ? "border-primary text-primary"
                          : "border-border-strong text-foreground",
                      )}
                    >
                      {p.label}
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
                  Message
                </label>
                <input
                  id="chat-input"
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoComplete="off"
                  placeholder="Type your message"
                  className="min-w-0 flex-1 rounded-full border border-border-strong bg-surface px-4 py-2.5 text-sm placeholder:text-subtle"
                />
                <button
                  type="submit"
                  disabled={pending || draft.trim().length === 0}
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <SendIcon className="size-5" />
                  <span className="sr-only">Send</span>
                </button>
              </form>
            </div>
          </div>
        </section>

        {/* Timeline column (desktop) */}
        <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface px-6 py-5 lg:flex">
          <div>
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-muted">
              Lease timeline
            </h2>
            <p className="mt-1 text-xs text-subtle">Follows your conversation, step by step.</p>
          </div>
          <LeaseTimeline stage={stage} />
          <AgentActivity rows={agentRows} className="border-t border-border pt-4" />
          <p className="mt-auto text-xs text-subtle">
            Amounts are in USDC (devnet test token). No real money moves.
          </p>
        </aside>
      </div>
    </MotionConfig>
  );
}
