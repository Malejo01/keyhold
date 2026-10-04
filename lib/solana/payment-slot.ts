import type { PaymentKind, PaymentResult, SessionState } from "../contracts";

/** Month indexes (0-based) already paid, read back from the memos the server itself wrote. */
export function paidRentMonths(payments: PaymentResult[]): Set<number> {
  const months = new Set<number>();
  for (const payment of payments) {
    if (payment.kind !== "rent") continue;
    const match = /:rent:(\d+):[0-9a-f]{64}$/.exec(payment.memo);
    if (match) months.add(Number(match[1]));
  }
  return months;
}

export type PaymentSlot =
  | { ok: true; monthIndex?: number }
  | { ok: false; error: string; status: 409 };

/**
 * Which item the session may pay next. The client never chooses or skips a month: the deposit comes
 * first, then rent months in order. Shared by POST /api/pay and the Solana Pay ticket route.
 */
export function nextPaymentSlot(state: SessionState, kind: PaymentKind): PaymentSlot {
  const lease = state.lease;
  if (!lease) return { ok: false, error: "No lease in this session yet", status: 409 };
  if (kind === "deposit") {
    if (state.payments.some((p) => p.kind === "deposit")) return { ok: false, error: "Deposit already paid", status: 409 };
    return { ok: true };
  }
  if (!state.payments.some((p) => p.kind === "deposit")) return { ok: false, error: "Pay the deposit first.", status: 409 };
  const paid = paidRentMonths(state.payments);
  let monthIndex = 0;
  while (paid.has(monthIndex)) monthIndex += 1;
  if (monthIndex >= lease.months) return { ok: false, error: "All rent months are already paid", status: 409 };
  return { ok: true, monthIndex };
}
