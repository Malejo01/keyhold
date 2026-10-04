/**
 * B5 security probes for the Solana Pay transaction request routes (qa-security-reviewer).
 *
 * Calls the route handlers in-process with NEXT_PUBLIC_SOLANA_PAY=1 set at runtime. It never sends a transaction:
 * the only devnet calls are reads plus `simulateTransaction` (no state change). No secret is printed.
 *
 * Usage (from the repo root, .env.local present): pnpm exec tsx tests/e2e/b5-solana-pay-attacks.ts
 * Exit code 1 while any probe shows the vulnerable behaviour. Fixed in B5 (see "Fixes (sol-client)" in the review); the same
 * assertions run offline as vitest regression tests in app/api/solana-pay/routes.test.ts and lib/solana/solana-pay.test.ts.
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
  const { platformKeypair, landlordKeypair, tenantKeypair, getPaymentMint, serverHeldPublicKeys } = await import("../../lib/solana/keys");
  const { getDevnetConnection } = await import("../../lib/solana/connection");
  const { quoteForIntent, quoteForBuild, QUOTE_LOOKAHEAD_SECONDS } = await import("../../lib/solana/solana-pay");
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
  const agency = serverHeldPublicKeys()[2];
  const mint = getPaymentMint();
  const connection = await getDevnetConnection();

  // --- Probe 1: account = a key the server holds (platform / landlord / agency) on a RENT ticket -----------------
  const t = await post(ticketRoute.POST, "http://localhost/api/solana-pay/ticket", { kind: "rent", session });
  const tj = (await t.json()) as { ticket: string; reference: string; amountBaseUnits: string };
  check("rent ticket minted", t.status === 200, String(t.status));
  const txUrl = `http://localhost/api/solana-pay/tx?t=${encodeURIComponent(tj.ticket)}`;

  const custodyAta = getAssociatedTokenAddressSync(mint, platform);
  const landlordAta = getAssociatedTokenAddressSync(mint, landlord);
  const custody = await connection.getTokenAccountBalance(custodyAta).catch(() => null);
  console.log(`  platform custody balance: ${custody?.value.uiAmountString ?? "n/a"} tUSDC; rent ${Number(tj.amountBaseUnits) / 1e6}`);

  const held = [["platform", platform], ["landlord", landlord], ...(agency ? [["agency", agency] as const] : [])] as const;
  for (const [name, key] of held) {
    const res = await post(txRoute.POST, txUrl, { account: key.toBase58() });
    const json = (await res.json()) as { transaction?: string; message?: string };
    check(`tx endpoint refuses account = ${name}`, res.status === 400 && !json.transaction, `got ${res.status} ${json.message ?? ""}`);
  }

  // --- Probe 2: the tx built for a normal wallet cannot move custody funds (simulation, signatures verified) ------
  const ana = tenantKeypair("ana").publicKey;
  const built = await post(txRoute.POST, txUrl, { account: ana.toBase58() });
  const builtJson = (await built.json()) as { transaction?: string };
  check("tx endpoint builds for a normal wallet", built.status === 200 && !!builtJson.transaction, String(built.status));
  if (builtJson.transaction) {
    const raw = Buffer.from(builtJson.transaction, "base64");
    const legacy = Transaction.from(raw);
    check("returned tx still needs a signature the server does not hold", !legacy.verifySignatures(true));
    const transfer = legacy.instructions[2];
    check("transfer authority is the wallet and the source is its own token account", transfer.keys[3].pubkey.equals(ana) && transfer.keys[0].pubkey.equals(getAssociatedTokenAddressSync(mint, ana)));
    const sim = await connection.simulateTransaction(VersionedTransaction.deserialize(raw), {
      sigVerify: true,
      commitment: "confirmed",
      accounts: { encoding: "base64", addresses: [custodyAta.toBase58(), landlordAta.toBase58()] },
    });
    const amountOf = (acc: { data: string[] } | null | undefined) => (acc ? Buffer.from(acc.data[0], "base64").readBigUInt64LE(64) : BigInt(0));
    const before = await Promise.all([custodyAta, landlordAta].map((x) => connection.getTokenAccountBalance(x, "confirmed")));
    const [custodyAfter, landlordAfter] = (sim.value.accounts ?? []).map(amountOf);
    const executed = (sim.value.accounts ?? []).every((x) => x !== null);
    const custodyDelta = !executed || custodyAfter === undefined ? BigInt(0) : custodyAfter - BigInt(before[0].value.amount);
    const landlordDelta = !executed || landlordAfter === undefined ? BigInt(0) : landlordAfter - BigInt(before[1].value.amount);
    check(
      "simulation (sigVerify on) of the server-signed tx fails and moves nothing",
      !!sim.value.err && custodyDelta === BigInt(0) && landlordDelta === BigInt(0),
      `simulate err=${JSON.stringify(sim.value.err)} custody delta=${custodyDelta} landlord delta=${landlordDelta}`,
    );
  }

  // --- Probe 3: two tickets for the same slot share one reference (second approval is refused / flagged) ----------
  const t2 = await post(ticketRoute.POST, "http://localhost/api/solana-pay/ticket", { kind: "rent", session });
  const t2j = (await t2.json()) as { ticket: string; reference: string };
  check("two tickets for the same slot share the reference", tj.reference === t2j.reference, tj.reference);

  // --- Probe 4: no in-flight grace; the quote already covers the latest landing time ------------------------------
  const rent0 = buildPaymentIntent(lease, "rent", 0);
  const onTimePrice = quoteForIntent(rent0, rent0.dueTs).amountBaseUnits;
  const latePrice = quoteForIntent(rent0, rent0.dueTs + 1).amountBaseUnits;
  check("quote at the due date minus the lookahead is the on-time price", quoteForBuild(rent0, rent0.dueTs - QUOTE_LOOKAHEAD_SECONDS).amountBaseUnits === onTimePrice);
  check("quote inside the lookahead window is the late price", quoteForBuild(rent0, rent0.dueTs - 1).amountBaseUnits === latePrice);

  console.log(`
${failures === 0 ? "ALL PROBES PASSED" : `${failures} PROBE(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
