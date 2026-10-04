// Solana Pay transaction request endpoint (spec: GET = label + icon, POST { account } = base64 transaction).
// Called by the wallet with the ticket from the QR. The ticket is HMAC-signed by the server, so the wallet (or anyone)
// cannot change the amount, memo, destination or month. The amount is recomputed here with server time.
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { APP_NAME } from "@/lib/config/brand";
import { logError } from "@/lib/db/http";
import { getDevnetConnection } from "@/lib/solana/connection";
import { PAYMENT_DECIMALS, platformKeypair } from "@/lib/solana/keys";
import { SOLANA_PAY_LIMITS, checkRateLimit, clientIp } from "@/lib/solana/rate-limit";
import {
  ForbiddenPayerError,
  buildSolanaPayTransaction,
  findValidPayment,
  isForbiddenPayer,
  quoteForBuild,
  serializeForWallet,
  tokenBalanceOf,
} from "@/lib/solana/solana-pay";
import {
  CORS_HEADERS,
  corsError,
  corsJson,
  custodialOnly,
  publicOrigin,
  solanaPayEnabled,
  validateParamsFor,
} from "@/lib/solana/solana-pay-http";
import { InvalidTicketError, decodeTicket } from "@/lib/solana/solana-pay-ticket";

export const runtime = "nodejs";

const postSchema = z.object({ account: z.string().min(32).max(44) });

function readTicket(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  return decodeTicket(token, Math.floor(Date.now() / 1000));
}

function ticketError(err: unknown): Response | null {
  if (err instanceof InvalidTicketError) return corsError(err.message, err.expired ? 410 : 401);
  return null;
}

export function OPTIONS(): Response {
  // The surface does not exist while the flag is off (no CORS preflight answer either).
  if (!solanaPayEnabled()) return corsError("Not found", 404);
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function rateLimited(request: Request): Response | null {
  const retryAfter = checkRateLimit(SOLANA_PAY_LIMITS.tx, clientIp(request), Date.now());
  if (retryAfter === 0) return null;
  const res = corsError("Too many requests, slow down", 429);
  res.headers.set("Retry-After", String(retryAfter));
  return res;
}

export async function GET(request: Request): Promise<Response> {
  if (!solanaPayEnabled()) return corsError("Not found", 404);
  const limited = rateLimited(request);
  if (limited) return limited;
  try {
    readTicket(request);
  } catch (err) {
    const response = ticketError(err);
    if (response) return response;
    throw err;
  }
  return corsJson({ label: APP_NAME, icon: `${publicOrigin(request)}/icon.svg` });
}

export async function POST(request: Request): Promise<Response> {
  if (!solanaPayEnabled()) return corsError("Not found", 404);
  if (!custodialOnly()) return corsError("Solana Pay is only available in custodial escrow mode", 501);
  const limited = rateLimited(request);
  if (limited) return limited;

  let payload;
  try {
    payload = readTicket(request);
  } catch (err) {
    const response = ticketError(err);
    if (response) return response;
    logError("solana-pay/tx", err);
    return corsError("Server misconfigured", 500);
  }

  let payer: PublicKey;
  try {
    const raw = postSchema.parse(await request.json());
    payer = new PublicKey(raw.account);
    if (!PublicKey.isOnCurve(payer.toBytes())) throw new Error("not a wallet");
  } catch {
    return corsError("Invalid account", 400);
  }

  try {
    const { intent } = payload;
    const reference = new PublicKey(payload.reference);
    const checks = validateParamsFor(intent, reference);

    // B5-1: the paying wallet must be the tenant's own wallet. Any key the server holds (platform/custody and fee
    // payer, landlord, agency) or the destination owner is refused before anything is built or signed.
    if (isForbiddenPayer(payer, checks.destinationOwner, checks.serverKeys)) return corsError("Invalid account", 400);

    const connection = await getDevnetConnection();
    const quote = quoteForBuild(intent, Math.floor(Date.now() / 1000));

    // One payment per slot: the reference is shared by every ticket and by the custodial button for this slot, so a
    // valid payment under it (from either path) means this slot is already paid.
    if (await findValidPayment(connection, checks)) return corsError("This payment was already made", 409);
    if ((await tokenBalanceOf(connection, checks.mint, payer)) < quote.amountBaseUnits) {
      return corsError("Your wallet does not hold enough devnet test USDC for this payment", 409);
    }

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = buildSolanaPayTransaction({
      intent,
      payer,
      reference,
      destinationOwner: checks.destinationOwner,
      mint: checks.mint,
      amountBaseUnits: quote.amountBaseUnits,
      feePayer: platformKeypair(),
      blockhash,
      serverKeys: checks.serverKeys,
    });
    const label = intent.kind === "deposit" ? "Security deposit" : "Rent payment";
    const amount = (Number(quote.amountBaseUnits) / 10 ** PAYMENT_DECIMALS).toFixed(PAYMENT_DECIMALS).replace(/\.?0+$/, "");
    return corsJson({ transaction: serializeForWallet(tx), message: `${label}: ${amount} test USDC (devnet)` });
  } catch (err) {
    if (err instanceof ForbiddenPayerError) return corsError("Invalid account", 400);
    logError("solana-pay/tx", err);
    return corsError("Could not build the transaction", 502);
  }
}
