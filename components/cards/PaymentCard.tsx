"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import type { PayResponse, PaymentKind, PriceQuoteDto, SignedSession } from "@/lib/contracts";
import { checkDraw, confirmRing, loop, priceRise, spin, swap } from "@/lib/motion/presets";
import { CountUp } from "../CountUp";
import { formatBps, formatUsdc } from "../format";
import { Badge, Button, CardShell, AlertIcon, ClockIcon, ShieldIcon, cx } from "../ui";
import { SOLANA_PAY_ENABLED, SolanaPayQr } from "./SolanaPayQr";

type PayStatus = "idle" | "processing" | "confirmed" | "error";

const kindCopy: Record<PaymentKind, { title: string; action: string }> = {
  deposit: { title: "Security deposit", action: "Pay deposit" },
  rent: { title: "Rent payment", action: "Pay rent" },
};

function Spinner() {
  const reduced = useReducedMotion();
  return (
    <motion.span
      aria-hidden="true"
      variants={spin}
      initial="idle"
      animate={loop(reduced, "active")}
      className="inline-block size-4 rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function PaymentCard({
  kind,
  quote,
  alreadyPaid,
  depositSecured,
  onPay,
  getSession,
  onPaid,
}: {
  kind: PaymentKind;
  quote: PriceQuoteDto;
  alreadyPaid: boolean;
  /** Rent cannot be paid before the deposit is confirmed. */
  depositSecured: boolean;
  /** Resolves when the server confirmed the payment; rejects with a readable message otherwise. */
  onPay: (kind: PaymentKind) => Promise<void>;
  /** Solana Pay QR (NEXT_PUBLIC_SOLANA_PAY=1): current signed session, and the handler for a QR-confirmed payment. */
  getSession?: () => SignedSession | undefined;
  onPaid?: (res: PayResponse) => void;
}) {
  const [status, setStatus] = useState<PayStatus>(alreadyPaid ? "confirmed" : "idle");
  const [error, setError] = useState<string | null>(null);
  const copy = kindCopy[kind];
  const isRent = kind === "rent";
  const locked = isRent && !depositSecured;

  async function pay() {
    setStatus("processing");
    setError(null);
    try {
      await onPay(kind);
      setStatus("confirmed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The payment could not be completed.");
      setStatus("error");
    }
  }

  const lines = [
    { key: "usdc", label: "Paid in USDC", bps: quote.breakdown.usdcBps },
    { key: "ontime", label: "On-time payment", bps: quote.breakdown.ontimeBps },
  ];

  return (
    <CardShell label={copy.title} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-display text-base font-semibold">
          <ShieldIcon className="size-5 text-primary" />
          {copy.title}
        </h3>
        {isRent &&
          (quote.onTime ? (
            <Badge tone="success">
              <ClockIcon className="size-3.5" />
              On time
            </Badge>
          ) : (
            <Badge tone="neutral">After due date</Badge>
          ))}
      </div>

      {/* Two prices */}
      <div>
        {isRent && (
          <p className="text-sm text-muted">
            List price{" "}
            <span className="tabular-nums line-through decoration-2">{formatUsdc(quote.listBaseUnits)}</span>
          </p>
        )}
        <motion.p
          variants={priceRise}
          initial="hidden"
          animate="show"
          className="mt-1 flex flex-wrap items-baseline gap-x-2 font-display text-3xl font-bold tabular-nums leading-none"
        >
          {isRent && quote.discountBps > 0 ? (
            <CountUp from={quote.listBaseUnits} to={quote.amountBaseUnits} />
          ) : (
            formatUsdc(quote.amountBaseUnits)
          )}
          <span className="text-base font-semibold text-muted">USDC (devnet test token)</span>
        </motion.p>
      </div>

      {/* Breakdown, straight from the server quote */}
      {isRent && (
      <ul className="flex flex-col gap-1.5 rounded-md bg-sunken p-3 text-sm">
        {lines.map((l) => (
          <li
            key={l.key}
            className={cx("flex items-center justify-between gap-3", l.bps === 0 && "text-subtle")}
          >
            <span>{l.label}</span>
            <span className={cx("font-semibold tabular-nums", l.bps > 0 && "text-success")}>
              {l.bps > 0 ? `−${formatBps(l.bps)}` : "not applied"}
            </span>
          </li>
        ))}
        <li className="mt-1 flex items-center justify-between gap-3 border-t border-border pt-2 font-semibold">
          <span>Total discount</span>
          <span className="tabular-nums">
            {quote.discountBps > 0 ? `−${formatBps(quote.discountBps)}` : "none"}
          </span>
        </li>
      </ul>
      )}

      {/* Action + status */}
      <div aria-live="polite" role="status" className="min-h-11">
        <AnimatePresence mode="wait" initial={false}>
          {status === "confirmed" ? (
            <motion.div
              key="confirmed"
              variants={swap}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2.5 text-sm font-semibold text-success"
            >
              <span className="relative flex size-6 items-center justify-center">
                <motion.span
                  aria-hidden="true"
                  variants={confirmRing}
                  initial="hidden"
                  animate="show"
                  className="absolute inset-0 rounded-full bg-success"
                />
                <span className="flex size-6 items-center justify-center rounded-full bg-success text-primary-foreground">
                  <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <motion.path d="M5 12.5l4.5 4.5L19 7.5" variants={checkDraw} initial="hidden" animate="show" />
                  </svg>
                </span>
              </span>
              Payment confirmed
            </motion.div>
          ) : status === "processing" ? (
            <motion.div
              key="processing"
              variants={swap}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex items-center gap-2 rounded-md bg-primary-soft px-3 py-2.5 text-sm font-semibold text-primary"
            >
              <Spinner />
              Confirming your payment…
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              variants={swap}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex flex-col gap-2"
            >
              <Button
                onClick={locked ? undefined : pay}
                aria-disabled={locked || undefined}
                aria-describedby={locked ? `pay-hint-${kind}` : undefined}
                className="w-full sm:w-auto sm:self-start"
              >
                {status === "error"
                  ? "Try again"
                  : `${copy.action} · ${formatUsdc(quote.amountBaseUnits)} USDC`}
              </Button>
              {SOLANA_PAY_ENABLED && !locked && getSession && onPaid && (
                <SolanaPayQr
                  kind={kind}
                  getSession={getSession}
                  onConfirmed={(res) => {
                    onPaid(res);
                    setStatus("confirmed");
                  }}
                />
              )}
              {locked && (
                <p id={`pay-hint-${kind}`} className="text-xs text-muted">
                  Available after the deposit is paid.
                </p>
              )}
              {error && (
                <p className="flex items-start gap-1.5 text-sm text-danger">
                  <AlertIcon className="mt-0.5 size-4 shrink-0" />
                  {error}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </CardShell>
  );
}
