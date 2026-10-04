// Server-only: custodial deposit release with a simulated 2-of-3 approval.
// The agency proposes a split; the server signs the release terms with two of the three demo keys
// (agency plus the chosen counterparty), verifies them, and only then does the custody wallet send the tUSDC.
// The reason text is hashed with sha256 and never stored or logged; the memo carries only the hash.
import { randomBytes } from "node:crypto";
import {
  TokenAccountNotFoundError,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { Transaction, type Keypair, type PublicKey } from "@solana/web3.js";
import { getDevnetConnection } from "../solana/connection";
import { explorerTxUrl } from "../solana/explorer";
import { sha256Hex } from "../solana/hash";
import { PAYMENT_DECIMALS, getPaymentMint, loadKeypair, platformKeypair } from "../solana/keys";
import { fetchBlockTime, memoInstruction } from "../solana/transfer";
import { ROLES, signWithSecretKey, termsMessage, verifyTwoOfThree, type Approval, type ReleaseTerms, type Role, type SignerSet } from "./approvals";
import { invalidateLedgerCache, loadLeaseForRelease } from "./chain";
import { buildReleaseMemo } from "./memo";
import { ReleaseError, planRelease } from "./plan";

if (typeof window !== "undefined") {
  throw new Error("lib/agency/release.ts must only be imported on the server.");
}

export interface ReleaseInput {
  leaseId: string;
  /** Base units, decimal strings. */
  toTenant: string;
  toLandlord: string;
  /** Free text. Hashed, never stored. */
  reason: string;
  /** Which party gives the second approval next to the agency. */
  approver: "tenant" | "landlord";
}

export interface ReleaseResult {
  leaseId: string;
  signature: string;
  explorerUrl: string;
  blockTime: number;
  memo: string;
  reasonHash: string;
  toTenant: string;
  toLandlord: string;
  /** Roles whose signatures over the terms were verified before sending. */
  approvedBy: Role[];
  simulated: true;
}

/** Same-instance double-submit guard (the chain scan only sees confirmed releases). */
const inFlight = new Set<string>();

function loadAgencyKey(): Keypair {
  try {
    return loadKeypair("agency");
  } catch {
    throw new ReleaseError("AGENCY_SECRET_KEY is not configured on this deployment, so deposits cannot be released here.", 503);
  }
}

async function custodyBalance(owner: PublicKey): Promise<bigint> {
  const connection = await getDevnetConnection();
  try {
    return (await getAccount(connection, getAssociatedTokenAddressSync(getPaymentMint(), owner))).amount;
  } catch (error) {
    if (error instanceof TokenAccountNotFoundError) return BigInt(0);
    throw error;
  }
}

function tryLoad(name: "ana" | "bruno" | "carla"): Keypair | null {
  try {
    return loadKeypair(name);
  } catch {
    return null;
  }
}

export async function releaseDeposit(input: ReleaseInput): Promise<ReleaseResult> {
  if (process.env.ESCROW_MODE?.trim() === "program") {
    throw new ReleaseError("Release from custody is only available in custodial mode.", 409);
  }
  const agency = loadAgencyKey();
  if (inFlight.has(input.leaseId)) throw new ReleaseError("A release for this lease is already in progress.", 409);
  inFlight.add(input.leaseId);
  try {
    // Targeted fresh read, never the 30 s cache: the idempotency check must see the latest chain state.
    const found = await loadLeaseForRelease(input.leaseId);
    if (found.releaseMemoSeen) {
      throw new ReleaseError("This deposit was already released (a release memo exists on chain).", 409);
    }
    if (found.incomplete) {
      throw new ReleaseError("The deposit transaction could not be read yet (RPC rate limit). Try again in a moment.", 503);
    }
    const plan = planRelease(found.lease, input.toTenant, input.toLandlord);

    const custody = platformKeypair();
    const landlord = loadKeypair("landlord");
    const tenant = (["ana", "bruno", "carla"] as const)
      .map(tryLoad)
      .find((kp) => kp?.publicKey.toBase58() === plan.payer);
    if (!tenant) throw new ReleaseError("The deposit was not paid by a demo tenant wallet on this deployment.", 409);

    // Simulated 2-of-3: the server holds all three demo keys, signs with two, then verifies before it sends.
    const parties: Record<Role, Keypair> = { tenant, landlord, agency };
    const reasonHash = sha256Hex(input.reason.trim());
    const terms: ReleaseTerms = {
      leaseId: plan.leaseId,
      toTenant: plan.toTenant.toString(),
      toLandlord: plan.toLandlord.toString(),
      reasonHash,
      nonce: randomBytes(16).toString("hex"),
    };
    const message = termsMessage(terms);
    const approvals: Approval[] = (["agency", input.approver] as const).map((role) => ({
      role,
      pubkey: parties[role].publicKey.toBase58(),
      signature: signWithSecretKey(parties[role].secretKey, message),
    }));
    const signers: SignerSet = {
      keys: Object.fromEntries(ROLES.map((r) => [r, parties[r].publicKey.toBytes()])) as SignerSet["keys"],
      base58: Object.fromEntries(ROLES.map((r) => [r, parties[r].publicKey.toBase58()])) as SignerSet["base58"],
    };
    const approvedBy = verifyTwoOfThree(terms, approvals, signers);

    const memo = buildReleaseMemo(plan.leaseId, reasonHash);
    if ((await custodyBalance(custody.publicKey)) < plan.toTenant + plan.toLandlord) {
      throw new ReleaseError("The custody wallet does not hold enough test tokens for this release.", 409);
    }

    const connection = await getDevnetConnection();
    const mint = getPaymentMint();
    const custodyAta = getAssociatedTokenAddressSync(mint, custody.publicKey);
    const tx = new Transaction();
    const payouts: Array<[PublicKey, bigint]> = [
      [tenant.publicKey, plan.toTenant],
      [landlord.publicKey, plan.toLandlord],
    ];
    for (const [owner, amount] of payouts) {
      if (amount <= BigInt(0)) continue;
      const ata = getAssociatedTokenAddressSync(mint, owner);
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(custody.publicKey, ata, owner, mint),
        createTransferCheckedInstruction(custodyAta, mint, ata, custody.publicKey, amount, PAYMENT_DECIMALS),
      );
    }
    tx.add(memoInstruction(memo));
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = custody.publicKey;
    tx.sign(custody);
    const signature = await connection.sendRawTransaction(tx.serialize());
    const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    if (confirmation.value.err) throw new ReleaseError("The release transaction failed on chain.", 502);
    const blockTime = await fetchBlockTime(signature);
    invalidateLedgerCache();
    return {
      leaseId: plan.leaseId,
      signature,
      explorerUrl: explorerTxUrl(signature),
      blockTime,
      memo,
      reasonHash,
      toTenant: terms.toTenant,
      toLandlord: terms.toLandlord,
      approvedBy,
      simulated: true,
    };
  } finally {
    inFlight.delete(input.leaseId);
  }
}
