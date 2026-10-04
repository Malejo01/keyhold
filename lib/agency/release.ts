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
import { Transaction, type Connection, type Keypair, type PublicKey } from "@solana/web3.js";
import { getDevnetConnection } from "../solana/connection";
import { explorerAddressUrl, explorerTxUrl } from "../solana/explorer";
import { sha256Hex } from "../solana/hash";
import { PAYMENT_DECIMALS, getPaymentMint, loadKeypair, platformKeypair } from "../solana/keys";
import { fetchBlockTime, memoInstruction } from "../solana/transfer";
import { ROLES, signWithSecretKey, termsMessage, verifyTwoOfThree, type Approval, type ReleaseTerms, type Role, type SignerSet } from "./approvals";
import { invalidateLedgerCache, loadLeaseForRelease } from "./chain";
import { isAlreadyInUse, releaseMarkerAddress, releaseMarkerInstruction } from "./marker";
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

/**
 * Same-instance double-submit guard: it only saves a round trip. The real idempotency is on chain: every release
 * transaction creates the per-lease marker account (lib/agency/marker.ts), so a second one fails atomically.
 */
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

const ALREADY_RELEASED = "Already released: this lease's deposit was already paid out (its on-chain release marker exists).";

/** Whether the lease's marker account exists and, if so, the oldest successful transaction that touched it (the original release). */
async function markerState(connection: Connection, marker: PublicKey): Promise<{ exists: boolean; originalSignature: string | null }> {
  const info = await connection.getAccountInfo(marker, "confirmed");
  if (!info) return { exists: false, originalSignature: null };
  try {
    const sigs = await connection.getSignaturesForAddress(marker, { limit: 10 }, "confirmed");
    const ok = sigs.filter((x) => !x.err);
    return { exists: true, originalSignature: ok.length ? ok[ok.length - 1].signature : null };
  } catch {
    return { exists: true, originalSignature: null };
  }
}

function alreadyReleased(marker: PublicKey, originalSignature: string | null): ReleaseError {
  return new ReleaseError(ALREADY_RELEASED, 409, originalSignature ? explorerTxUrl(originalSignature) : explorerAddressUrl(marker.toBase58()));
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
    const custody = platformKeypair();
    const connection = await getDevnetConnection();
    const marker = await releaseMarkerAddress(custody.publicKey, input.leaseId);

    // Fast path for a friendly 409: the on-chain marker of an earlier release (the chain also enforces it below).
    const existing = await markerState(connection, marker);
    if (existing.exists) throw alreadyReleased(marker, existing.originalSignature);

    // Targeted fresh read, never the 30 s cache. Releases made before the marker existed are found by the ledger
    // (only transactions authorised by custody count, so a forged memo cannot block a release).
    const found = await loadLeaseForRelease(input.leaseId);
    if (found.incomplete && !found.lease?.release) {
      throw new ReleaseError("The lease transactions could not be read yet (RPC rate limit). Try again in a moment.", 503);
    }
    const plan = planRelease(found.lease, input.toTenant, input.toLandlord);

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

    const mint = getPaymentMint();
    const custodyAta = getAssociatedTokenAddressSync(mint, custody.publicKey);
    const tx = new Transaction();
    // Instruction 0: creates the per-lease marker. If it already exists this whole transaction fails, no tokens move.
    tx.add(await releaseMarkerInstruction(custody.publicKey, plan.leaseId, await connection.getMinimumBalanceForRentExemption(0)));
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
    let signature = "";
    let failure: unknown = null;
    try {
      signature = await connection.sendRawTransaction(tx.serialize());
      const confirmation = await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
      failure = confirmation.value.err;
    } catch (err) {
      failure = err ?? new Error("send failed");
    }
    if (failure) {
      // Either the marker rejected a concurrent second release, or the send/confirmation failed. Read the marker:
      // if our own transaction created it, the release landed (e.g. a confirmation timeout); otherwise refuse.
      const after = await markerState(connection, marker).catch(() => ({ exists: false, originalSignature: null }));
      if (!(signature && after.originalSignature === signature)) {
        if (after.exists || isAlreadyInUse(failure)) throw alreadyReleased(marker, after.originalSignature);
        throw new ReleaseError("The release could not be completed. Nothing was released; check the lease status before retrying (a retry cannot pay twice).", 502);
      }
    }
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
