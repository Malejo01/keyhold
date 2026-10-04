// Solana Pay transaction request endpoint (spec: GET = label + icon, POST { account } = base64 transaction).
// Called by the wallet with the ticket from the QR. The ticket is HMAC-signed by the server, so the wallet (or anyone)
// cannot change the amount, memo, destination or month. The amount is recomputed here with server time.
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { APP_NAME } from "@/lib/config/brand";
import { logError } from "@/lib/db/http";
import { getDevnetConnection } from "@/lib/solana/connection";
import { PAYMENT_DECIMALS, getPaymentMint, platformKeypair } from "@/lib/solana/keys";
import {
  buildSolanaPayTransaction,
  quoteForIntent,
  referenceAlreadyUsed,
  serializeForWallet,
  tokenBalanceOf,
} from "@/lib/solana/solana-pay";
import {
  CORS_HEADERS,
  corsError,
  corsJson,
  custodialOnly,
  destinationOwnerFor,
  publicOrigin,
  solanaPayEnabled,
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
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: Request): Promise<Response> {
  if (!solanaPayEnabled()) return corsError("Not found", 404);
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
    const connection = await getDevnetConnection();
    const mint = getPaymentMint();
    const quote = quoteForIntent(intent, Math.floor(Date.now() / 1000));

    // One payment per ticket: refuse to build a second tx once the reference was used.
    if (await referenceAlreadyUsed(connection, reference)) return corsError("This payment was already made", 409);
    if ((await tokenBalanceOf(connection, mint, payer)) < quote.amountBaseUnits) {
      return corsError("Your wallet does not hold enough devnet test USDC for this payment", 409);
    }

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = buildSolanaPayTransaction({
      intent,
      payer,
      reference,
      destinationOwner: destinationOwnerFor(intent.kind),
      mint,
      amountBaseUnits: quote.amountBaseUnits,
      feePayer: platformKeypair(),
      blockhash,
    });
    const label = intent.kind === "deposit" ? "Security deposit" : "Rent payment";
    const amount = (Number(quote.amountBaseUnits) / 10 ** PAYMENT_DECIMALS).toFixed(PAYMENT_DECIMALS).replace(/\.?0+$/, "");
    return corsJson({ transaction: serializeForWallet(tx), message: `${label}: ${amount} test USDC (devnet)` });
  } catch (err) {
    logError("solana-pay/tx", err);
    return corsError("Could not build the transaction", 502);
  }
}
