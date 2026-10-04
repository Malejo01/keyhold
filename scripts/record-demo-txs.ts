/**
 * Sends one real deposit and one real rent transfer on devnet through executePayment, checks the
 * memo hash on chain with readMemoHash, and writes the explorer links to docs/submission/tx-links.md.
 *
 * Run `pnpm setup:devnet` first (platform wallet funded, tUSDC minted). Devnet only.
 * Usage: pnpm tsx scripts/record-demo-txs.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { config as loadDotenv } from "dotenv";
import { APP_NAME } from "../lib/config/brand";
import type { PaymentIntent } from "../lib/contracts";
import { sha256Hex } from "../lib/solana/hash";
import { executePayment } from "../lib/solana/pay";
import { explorerAddressUrl } from "../lib/solana/explorer";
import { getPaymentMint, landlordKeypair, platformKeypair } from "../lib/solana/keys";
import { readMemoHash } from "../lib/solana/verify";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

const OUT_PATH = resolve(process.cwd(), "docs/submission/tx-links.md");
const TOKEN = BigInt(1_000_000);

async function main() {
  const leaseId = `demo-${randomBytes(6).toString("hex")}`;
  const contractText = `${APP_NAME} demo lease ${leaseId}. Sample text for the hackathon recording; no personal data.`;
  const contractHash = sha256Hex(contractText);
  const now = Math.floor(Date.now() / 1000);

  const base: Omit<PaymentIntent, "kind" | "monthIndex"> = {
    leaseId,
    payer: "ana",
    listAmountBaseUnits: (BigInt(400) * TOKEN).toString(),
    contractHash,
    dueTs: now + 5 * 24 * 3600,
    discountUsdcBps: 300,
    discountOntimeBps: 200,
  };

  console.log(`Lease ${leaseId}, contract hash ${contractHash}`);
  const deposit = await executePayment({ ...base, kind: "deposit" });
  console.log(`Deposit: ${deposit.explorerUrl}`);
  const rent = await executePayment({ ...base, kind: "rent", monthIndex: 0 });
  console.log(`Rent:    ${rent.explorerUrl}`);

  const depositMemoHash = await readMemoHash(deposit.signature);
  const rentMemoHash = await readMemoHash(rent.signature);
  const verified = depositMemoHash === contractHash && rentMemoHash === contractHash;
  console.log(`Memo hash read back from chain matches sha256(contract): ${verified}`);
  if (!verified) throw new Error("On-chain memo hash does not match the contract hash.");

  const fmt = (units: string) => `${Number(BigInt(units)) / 1_000_000} tUSDC`;
  const md = `# Devnet transaction links

Real Solana **devnet** transactions produced by \`scripts/record-demo-txs.ts\` through the same
\`executePayment\` code path the app uses. Escrow is custodial in this phase: the deposit goes to the
platform custody wallet, rent goes straight to the landlord. The platform wallet pays every fee.

- Demo lease id: \`${leaseId}\` (opaque; no personal data)
- Contract text: \`${contractText}\`
- Contract sha256: \`${contractHash}\`
- tUSDC mint: [${getPaymentMint().toBase58()}](${explorerAddressUrl(getPaymentMint().toBase58())})
- Platform custody wallet: [${platformKeypair().publicKey.toBase58()}](${explorerAddressUrl(platformKeypair().publicKey.toBase58())})
- Landlord wallet: [${landlordKeypair().publicKey.toBase58()}](${explorerAddressUrl(landlordKeypair().publicKey.toBase58())})

| Payment | Amount | Discount | On time (blockTime) | Explorer |
| --- | --- | --- | --- | --- |
| Deposit (tenant -> custody) | ${fmt(deposit.amountBaseUnits)} | ${deposit.discountAppliedBps / 100}% | ${deposit.onTime} | [tx](${deposit.explorerUrl}) |
| Rent, month 0 (tenant -> landlord) | ${fmt(rent.amountBaseUnits)} | ${rent.discountAppliedBps / 100}% | ${rent.onTime} | [tx](${rent.explorerUrl}) |

Memos (verified on chain: trailing hash equals the contract sha256):

- \`${deposit.memo}\`
- \`${rent.memo}\`

Recorded at blockTime ${rent.blockTime} (unix seconds).
`;
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, md);
  console.log(`Wrote ${OUT_PATH}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
