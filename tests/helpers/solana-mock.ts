// Test double for lib/solana/pay: counts transfers and lets a test inject failures at each step of a payment
// (prepare = build+sign, send, reconcile check). Used with `vi.mock('@/lib/solana/pay', ...)`.
import type { PaymentIntent, PaymentResult } from '../../lib/contracts';
import type { PaymentAttempt, PaymentCheck, PreparedPayment } from '../../lib/solana/pay';

export interface SolanaMockState {
  /** Transfers that really "landed" through a successful send. */
  transfers: number;
  prepares: number;
  /** Errors thrown (in order) by preparePayment, before anything is sent. */
  prepareFail: Error[];
  /** Failures of the send step; `landed: true` simulates a tx that reached the chain before the error. */
  sendFail: { error: Error; landed: boolean }[];
  /** Scripted answers of checkPayment; when empty it answers from `landed`. An Error is thrown (RPC down). */
  checks: (PaymentCheck['state'] | Error)[];
  /** Signatures that exist on the fake cluster. */
  landed: Set<string>;
}

export function newSolanaState(): SolanaMockState {
  return { transfers: 0, prepares: 0, prepareFail: [], sendFail: [], checks: [], landed: new Set() };
}

export function resetSolanaState(state: SolanaMockState): void {
  Object.assign(state, newSolanaState());
}

function resultFor(intent: PaymentIntent, attempt: PaymentAttempt): PaymentResult {
  return {
    kind: intent.kind,
    signature: attempt.signature,
    explorerUrl: 'https://explorer.invalid/tx',
    blockTime: 1_800_000_000,
    amountBaseUnits: attempt.amountBaseUnits,
    discountAppliedBps: attempt.discountAppliedBps,
    onTime: true,
    memo: attempt.memo,
  };
}

/** Overrides for the module `lib/solana/pay`; everything else (buildMemo, InsufficientFundsError) stays real. */
export function solanaMockModule(
  original: typeof import('../../lib/solana/pay'),
  state: SolanaMockState,
): typeof import('../../lib/solana/pay') {
  return {
    ...original,
    preparePayment: async (intent: PaymentIntent): Promise<PreparedPayment> => {
      const failure = state.prepareFail.shift();
      if (failure) throw failure;
      state.prepares += 1;
      return {
        kind: intent.kind,
        signature: `sig-${state.prepares}-${Math.random().toString(36).slice(2)}`,
        serializedTx: 'AA==',
        blockhash: 'bh',
        lastValidBlockHeight: 1000,
        amountBaseUnits: intent.listAmountBaseUnits,
        discountAppliedBps: 0,
        memo: original.buildMemo(intent),
      };
    },
    submitPayment: async (intent: PaymentIntent, prepared: PreparedPayment): Promise<PaymentResult> => {
      const failure = state.sendFail.shift();
      if (failure) {
        if (failure.landed) {
          state.transfers += 1;
          state.landed.add(prepared.signature);
        }
        throw failure.error;
      }
      await new Promise((r) => setTimeout(r, 25)); // keep concurrent requests overlapping
      state.transfers += 1;
      state.landed.add(prepared.signature);
      return resultFor(intent, prepared);
    },
    checkPayment: async (intent: PaymentIntent, attempt: PaymentAttempt): Promise<PaymentCheck> => {
      const scripted = state.checks.shift();
      if (scripted instanceof Error) throw scripted;
      const answer = scripted ?? (state.landed.has(attempt.signature) ? 'confirmed' : 'pending');
      if (answer === 'confirmed') return { state: 'confirmed', result: resultFor(intent, attempt) };
      return { state: answer };
    },
  };
}
