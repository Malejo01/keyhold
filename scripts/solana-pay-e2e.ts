/**
 * End-to-end check of the Solana Pay transaction request flow against a running server, on REAL devnet.
 * It plays the wallet: asks the tx endpoint for a transaction with Ana's pubkey, signs it with the demo key
 * TENANT_ANA_SECRET_KEY (read from .env.local, never printed) and sends it, then polls the status endpoint until
 * the server confirms the payment through the unique reference. Runs deposit then rent month 0 (2 devnet txs).
 *
 * Needs the server started with NEXT_PUBLIC_SOLANA_PAY=1 and the same .env.local (SESSION_SECRET must match).
 * Usage: BASE_URL=http://localhost:3005 pnpm tsx scripts/solana-pay-e2e.ts
 * Optional: WRITE_LINKS=1 appends the signatures to docs/submission/tx-links.md.
 */
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { Transaction } from "@solana/web3.js";
import type { PaymentKind, PaymentResult, SignedSession } from "../lib/contracts";
import { applyEvent } from "../lib/agents/orchestrator";
import { createLeaseDraft } from "../lib/agents/lease";
import { newSession, signSession } from "../lib/db/session";
import { getDevnetConnection } from "../lib/solana/connection";
import { tenantKeypair } from "../lib/solana/keys";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:3005").replace(/\/$/, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

// Loosely typed on purpose: this script inspects ad-hoc API payloads.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

async function call(path: string, init?: RequestInit): Promise<{ status: number; json: Json }> {
  const res = await fetch(path.startsWith("http") ? path : `${BASE_URL}${path}`, init);
  let json: Json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, json };
}
const postJson = (path: string, body: unknown) =>
  call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The URL inside the `solana:` link, as a wallet would decode it. */
function linkFromSolanaUrl(url: string): string {
  if (!url.startsWith("solana:")) throw new Error("not a solana: URL");
  const rest = url.slice("solana:".length);
  return decodeURIComponent(rest.split("?label=")[0]);
}

async function payViaQr(kind: PaymentKind, session: SignedSession): Promise<{ result: PaymentResult; session: SignedSession } | null> {
  const ana = tenantKeypair("ana");
  console.log(`\n--- ${kind} via Solana Pay ---`);

  const t = await postJson("/api/solana-pay/ticket", { kind, session });
  check(`${kind}: ticket 200`, t.status === 200, `got ${t.status} ${t.status !== 200 ? JSON.stringify(t.json) : ""}`);
  if (t.status !== 200) return null;
  const { ticket, url, reference } = t.json as { ticket: string; url: string; reference: string };
  check(`${kind}: url is a solana: transaction request`, url.startsWith("solana:https%3A%2F%2F") || url.startsWith("solana:http%3A%2F%2F"), `${url.length} chars`);
  const link = linkFromSolanaUrl(url);

  // Spec: GET returns label + icon.
  const meta = await call(link);
  check(`${kind}: GET returns label and icon`, meta.status === 200 && typeof meta.json?.label === "string" && typeof meta.json?.icon === "string", JSON.stringify(meta.json));

  // Negative checks before paying.
  const forgedBody = ticket.split(".")[0];
  const forged = await postJson(link.replace(ticket, `${forgedBody}.AAAA`), { account: ana.publicKey.toBase58() });
  check(`${kind}: forged ticket signature -> 401`, forged.status === 401, `got ${forged.status}`);
  const badAccount = await postJson(link, { account: "not-a-key" });
  check(`${kind}: invalid account -> 400`, badAccount.status === 400, `got ${badAccount.status}`);
  const pendingFirst = await postJson("/api/solana-pay/status", { ticket, session });
  check(`${kind}: status is pending before payment`, pendingFirst.status === 200 && pendingFirst.json?.status === "pending", JSON.stringify(pendingFirst.json));

  // The wallet step: POST { account } -> base64 tx; sign; send.
  const built = await postJson(link, { account: ana.publicKey.toBase58() });
  check(`${kind}: POST returns a transaction`, built.status === 200 && typeof built.json?.transaction === "string", `got ${built.status} ${built.status !== 200 ? JSON.stringify(built.json) : ""}`);
  if (built.status !== 200) return null;
  const tx = Transaction.from(Buffer.from(built.json.transaction, "base64"));
  const refKey = tx.instructions[tx.instructions.length - 1].keys.at(-1);
  check(`${kind}: tx carries the reference as a read-only non-signer key`, refKey?.pubkey.toBase58() === reference && !refKey.isSigner && !refKey.isWritable);
  check(`${kind}: platform is fee payer and already signed`, tx.signatures[0].signature !== null);
  tx.partialSign(ana);
  const connection = await getDevnetConnection();
  const signature = await connection.sendRawTransaction(tx.serialize());
  const { blockhash, lastValidBlockHeight } = { blockhash: tx.recentBlockhash!, lastValidBlockHeight: (await connection.getLatestBlockhash()).lastValidBlockHeight };
  const conf = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  check(`${kind}: devnet tx confirmed`, !conf.value.err, signature);

  // Replay: a second tx for the same ticket must be refused now that the reference was used.
  const replay = await postJson(link, { account: ana.publicKey.toBase58() });
  check(`${kind}: replaying the tx request after payment -> 409`, replay.status === 409, `got ${replay.status}`);

  // Poll status like the UI does.
  let status: Json = null;
  for (let i = 0; i < 30; i++) {
    const r = await postJson("/api/solana-pay/status", { ticket, session });
    if (r.status === 200 && r.json?.status === "confirmed") {
      status = r.json;
      break;
    }
    await sleep(2500);
  }
  check(`${kind}: status confirms via the reference`, !!status, status ? "" : "timed out");
  if (!status) return null;
  const result = status.result as PaymentResult;
  check(`${kind}: signature matches`, result.signature === signature);
  check(`${kind}: blockTime comes from the chain`, Number.isInteger(result.blockTime) && Math.abs(result.blockTime - Date.now() / 1000) < 600, String(result.blockTime));
  check(`${kind}: memo has no PII`, /^lease:v1:ls_[0-9a-f]+:(deposit|rent:\d+):[0-9a-f]{64}$/.test(result.memo), result.memo);
  check(`${kind}: explorer url is devnet`, result.explorerUrl.endsWith(`/tx/${signature}?cluster=devnet`));
  const again = await postJson("/api/solana-pay/status", { ticket, session: status.session });
  check(`${kind}: status is idempotent`, again.status === 200 && again.json?.result?.signature === signature && again.json.session.state.payments.length === status.session.state.payments.length);

  // A ticket cannot be used with another session.
  const other = signSession(newSession("ana"));
  const foreign = await postJson("/api/solana-pay/status", { ticket, session: other });
  check(`${kind}: ticket is bound to its session -> 403`, foreign.status === 403, `got ${foreign.status}`);
  console.log(`  ${result.explorerUrl}`);
  console.log(`  amount ${result.amountBaseUnits} base units, discount ${result.discountAppliedBps} bps, onTime ${result.onTime}`);
  return { result, session: status.session };
}

async function main() {
  const lease = createLeaseDraft("ana", "prop-01");
  const start = applyEvent(newSession("ana"), { type: "lease_created", lease });
  let session = signSession(start);

  const unsupported = await postJson("/api/solana-pay/ticket", { kind: "rent", session });
  check("rent before the deposit -> 409", unsupported.status === 409, `got ${unsupported.status}`);
  const tampered = structuredClone(session);
  tampered.state.lease!.rentBaseUnits = "1";
  const t401 = await postJson("/api/solana-pay/ticket", { kind: "deposit", session: tampered });
  check("tampered session -> 401", t401.status === 401, `got ${t401.status}`);

  const deposit = await payViaQr("deposit", session);
  if (!deposit) throw new Error("deposit flow failed");
  check("deposit amount = lease deposit", deposit.result.amountBaseUnits === lease.depositBaseUnits);
  check("deposit memo hash = contract hash", deposit.result.memo.endsWith(lease.contractHash));
  session = deposit.session;
  const dupe = await postJson("/api/solana-pay/ticket", { kind: "deposit", session });
  check("a second deposit ticket is refused -> 409", dupe.status === 409, `got ${dupe.status}`);

  const rent = await payViaQr("rent", session);
  if (!rent) throw new Error("rent flow failed");
  check("rent memo is month 0", /:rent:0:/.test(rent.result.memo));
  check("rent is on time and discounted", rent.result.onTime && rent.result.discountAppliedBps > 0, `${rent.result.discountAppliedBps} bps`);
  check("session reaches ACTIVE", rent.session.state.stage === "ACTIVE", rent.session.state.stage);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  if (process.env.WRITE_LINKS === "1" && failures === 0) {
    const line = (label: string, r: PaymentResult) => `| ${label} | ${Number(r.amountBaseUnits) / 1e6} tUSDC | ${r.discountAppliedBps / 100}% | ${r.onTime} | [tx](${r.explorerUrl}) |`;
    appendFileSync(
      resolve(process.cwd(), "docs/submission/tx-links.md"),
      [
        "",
        "## Solana Pay transaction request (QR flow), devnet",
        "",
        "Produced by `scripts/solana-pay-e2e.ts`: the script plays the wallet (Ana's demo key signs the server-built tx), then the server confirms the payment through the unique reference. The platform wallet pays the fees.",
        "",
        "| Payment | Amount | Discount | On time (blockTime) | Explorer |",
        "| --- | --- | --- | --- | --- |",
        line("Deposit (Solana Pay, tenant -> custody)", deposit.result),
        line("Rent, month 0 (Solana Pay, tenant -> landlord)", rent.result),
        "",
        `Memos: \`${deposit.result.memo}\` and \`${rent.result.memo}\``,
        "",
      ].join("\n"),
    );
    console.log("tx links appended to docs/submission/tx-links.md");
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
