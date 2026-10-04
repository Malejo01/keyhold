"use client";

import { motion } from "framer-motion";
import type { PaymentResult } from "@/lib/contracts";
import { checkDraw, pop, receiptIn } from "@/lib/motion/presets";
import { formatBps, formatTs, formatUsdc, shortHash } from "../format";
import { Badge, CardShell, ClockIcon, ExternalIcon } from "../ui";

export function ReceiptCard({ result }: { result: PaymentResult }) {
  const title = result.kind === "deposit" ? "Deposit" : "Rent";

  return (
    <motion.div variants={receiptIn} initial="hidden" animate="show" className="max-w-2xl">
      <CardShell label="Receipt" className="flex flex-col gap-4 border-success">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-base font-semibold">
            <span className="flex size-6 items-center justify-center rounded-full bg-success text-primary-foreground">
              <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <motion.path d="M5 12.5l4.5 4.5L19 7.5" variants={checkDraw} initial="hidden" animate="show" />
              </svg>
            </span>
            Payment confirmed · {title}
          </h3>
          <motion.div variants={pop} initial="hidden" animate="show" transition={{ delay: 0.25 }}>
            {result.kind === "deposit" ? null : result.onTime ? (
              <Badge tone="success">
                <ClockIcon className="size-3.5" />
                On-time payment
              </Badge>
            ) : (
              <Badge tone="neutral">Paid after due date</Badge>
            )}
          </motion.div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Amount paid</p>
          <p className="font-display text-3xl font-bold tabular-nums">
            {formatUsdc(result.amountBaseUnits)}{" "}
            <span className="text-sm font-semibold text-muted">USDC (devnet test token)</span>
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted">Discount applied</dt>
            <dd className="font-semibold">
              {result.discountAppliedBps > 0 ? `−${formatBps(result.discountAppliedBps)}` : "none"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Confirmed</dt>
            <dd className="font-semibold">{formatTs(result.blockTime)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted">Receipt ID</dt>
            <dd>
              <code className="font-mono text-xs" title={result.signature}>
                {shortHash(result.signature, 12, 10)}
              </code>
            </dd>
          </div>
        </dl>

        <a
          href={result.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
        >
          View on Solana Explorer
          <ExternalIcon className="size-3.5" />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      </CardShell>
    </motion.div>
  );
}
