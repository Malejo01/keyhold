/**
 * B5 security probes for the Solana Pay transaction request routes (qa-security-reviewer).
 *
 * Calls the route handlers in-process with NEXT_PUBLIC_SOLANA_PAY=1 set at runtime. It never sends a transaction:
 * the only devnet calls are reads plus `simulateTransaction` (no state change). No secret is printed.
 *
 * Usage (from the repo root, .env.local present): pnpm exec tsx tests/e2e/b5-solana-pay-attacks.ts
 * Exit code 1 while any probe shows the vulnerable behaviour.
 */
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Transaction, VersionedTransaction } from "@solana/web3.js";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });
process.env.NEXT_PUBLIC_SOLANA_PAY = "1";

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function main() {
  const { createLeaseDraft, buildPaymentIntent } = await import("../../lib/agents/lease");
  const { applyEvent } = await import("../../lib/agents/orchestrator");
  const { newSession, signSession } = await import("../../lib/db/session");
  const { buildMemo } = await import("../../lib/solana/pay");
  const { platformKeypair, landlordKeypair, tenantKeypair, getPaymentMint } = await import("../../lib/solana/keys");
  const { getDevnetConnection } = await import("../../lib/solana/connection");
  const { quoteForIntent, toPaymentResult, IN_FLIGHT_GRACE_SECONDS } = await import("../../lib/solana/solana-pay");
  const ticketRoute = await import("../../app/api/solana-pay/ticket/route");
  const txRoute = await import("../../app/api/solana-pay/tx/route");

  const post = (handler: (r: Request) => Promise<Response>, url: string, body: unknown) =>
    handler(new Request(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));

  // A session whose deposit is recorded. In the real attack the tenant obtains it by paying the deposit once;
  // here the reviewer signs it locally so that no devnet tx is spent.
  const lease = createLeaseDraft("ana", "prop-01");
  let state = applyEvent(newSession("ana"), { type: "lease_created", lease });
  const depositIntent = buildPaymentIntent(lease, "deposit");
  state = applyEvent(state, {
    type: "payment_confirmed",
    result: {
      kind: "deposit",
      signature: "reviewer-fixture-no-tx",
      explorerUrl: "",
      blockTime: Math.floor(Date.now() / 1000),
      amountBaseUnits: lease.depositBaseUnits,
      discountAppliedBps: 0,
      onTime: true,
      memo: buildMemo(depositIntent),
    },
  });
  const session = signSession(state);

  const platform = platformKeypair().publicKey;
  const landlord = landlordKeypair().publicKey;
  const mint = getPaymentMint();
  const connection = await getDevnetConnection();

  // --- Probe 1: account = platform pubkey on a RENT ticket ---------------------------------------------------
  const t = await post(ticketRoute.POST, "http://localhost/api/solana-pay/ticket", { kind: "rent", session });
  const tj = (await t.json()) as { ticket: string; reference: string; amountBaseUnits: string };
  check("rent ticket minted", t.status === 200, String(t.status));
  const txUrl = `http://localhost/api/solana-pay/tx?t=${encodeURIComponent(tj.ticket)}`;

  const custody = await connection.getTokenAccountBalance(getAssociatedTokenAddressSync(mint, platform)).catch(() => null);
  console.log(`  platform custody balance: ${custody?.value.uiAmountString ?? "n/a"} tUSDC; rent ${Number(tj.amountBaseUnits) / 1e6}`);

  const asPlatform = await post(txRoute.POST, txUrl, { account: platform.toBase58() });
  const asPlatformJson = (await asPlatform.json()) as { transaction?: string; message?: string };
  check(
    "tx endpoint refuses account = platform (fee payer / custody owner)",
    asPlatform.status >= 400,
    `got ${asPlatform.status} ${asPlatformJson.message ?? ""}`,
  );
  if (asPlatform.status === 200 && asPlatformJson.transaction) {
    const raw = Buffer.from(asPlatformJson.transaction, "base64");
    const legacy = Transaction.from(raw);
    const fullySigned = legacy.verifySignatures(true);
    check("returned tx still needs a signature the server does not hold", !fullySigned, `fully signed by the server alone: ${fullySigned}`);
    // The token program on devnet logs little, so read the simulated post-balances of both token accounts instead.
    const custodyAta = getAssociatedTokenAddressSync(mint, platform);
    const landlordAta = getAssociatedTokenAddressSync(mint, landlord);
    const sim = await connection.simulateTransaction(VersionedTransaction.deserialize(raw), {
      sigVerify: true,
      commitment: "confirmed",
      accounts: { encoding: "base64", addresses: [custodyAta.toBase58(), landlordAta.toBase58()] },
    });
    const amountOf = (acc: { data: string[] } | null | undefined) =>
      acc ? Buffer.from(acc.data[0], "base64").readBigUInt64LE(64) : BigInt(0);
    const before = await Promise.all([custodyAta, landlordAta].map((a) => connection.getTokenAccountBalance(a, "confirmed")));
    const [custodyAfter, landlordAfter] = (sim.value.accounts ?? []).map(amountOf);
    const custodyDelta = custodyAfter - BigInt(before[0].value.amount);
    const landlordDelta = landlordAfter - BigInt(before[1].value.amount);
    check(
      "simulation (sigVerify on) of the server-only-signed tx does not move custody funds",
      !!sim.value.err || custodyDelta >= BigInt(0),
      `simulate err=${JSON.stringify(sim.value.err)} custody delta=${custodyDelta} landlord delta=+${landlordDelta} base units`,
    );
  }

  // --- Probe 2: account = landlord (destination owner of rent) -----------------------------------------------
  const asLandlord = await post(txRoute.POST, txUrl, { account: landlord.toBase58() });
  console.log(`  account = landlord on rent ticket -> ${asLandlord.status} (self-transfer, delta 0, status would reject)`);

  // --- Probe 3: two tickets for the same slot -> two references -> two payable txs (double pay) --------------
  const t2 = await post(ticketRoute.POST, "http://localhost/api/solana-pay/ticket", { kind: "rent", session });
  const t2j = (await t2.json()) as { ticket: string; reference: string };
  const ana = tenantKeypair("ana").publicKey.toBase58();
  const b1 = await post(txRoute.POST, txUrl, { account: ana });
  const b2 = await post(txRoute.POST, `http://localhost/api/solana-pay/tx?t=${encodeURIComponent(t2j.ticket)}`, { account: ana });
  console.log(
    `  two tickets for rent month 0: refs differ=${tj.reference !== t2j.reference}, tx built ${b1.status}/${b2.status} (both payable -> double charge possible)`,
  );

  // --- Probe 4: in-flight grace, self-built tx -------------------------------------------------------------
  const rent0 = buildPaymentIntent(lease, "rent", 0);
  const late = rent0.dueTs + IN_FLIGHT_GRACE_SECONDS - 1;
  const strictLate = quoteForIntent(rent0, late).amountBaseUnits;
  const onTimeAmount = quoteForIntent(rent0, rent0.dueTs).amountBaseUnits;
  const rec = toPaymentResult(rent0, { signature: "x", blockTime: late, amountBaseUnits: onTimeAmount });
  console.log(
    `  grace: blockTime = due+${IN_FLIGHT_GRACE_SECONDS - 1}s accepts ${onTimeAmount} (strict late price ${strictLate}); record onTime=${rec.onTime} discountAppliedBps=${rec.discountAppliedBps}`,
  );

  console.log(`\n${failures === 0 ? "ALL PROBES PASSED" : `${failures} PROBE(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
