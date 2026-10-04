// Server-only helpers shared by the /api/solana-pay/* routes.
import { encodeURL } from "@solana/pay";
import type { PublicKey } from "@solana/web3.js";
import type { PaymentKind } from "../contracts";
import { landlordKeypair, platformKeypair } from "./keys";

/** Feature flag. When off, every route answers 404 so the surface does not exist. Default off. */
export function solanaPayEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SOLANA_PAY === "1";
}

/** Wallets are native or browser apps and call the endpoint cross-origin (Solana Pay spec: CORS open). */
export const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,accept-encoding",
  "cache-control": "no-store",
};

export function corsJson(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

/** Spec error shape is `{ message }`; `error` is kept for our own client. */
export function corsError(message: string, status: number): Response {
  return corsJson({ message, error: message }, status);
}

/** Only the custodial path exists today; the Anchor path (ESCROW_MODE=program) is a later phase. */
export function custodialOnly(): boolean {
  const mode = process.env.ESCROW_MODE?.trim() || "custodial";
  return mode === "custodial";
}

/** Custody (deposit) or landlord (rent): the owner of the destination token account. */
export function destinationOwnerFor(kind: PaymentKind): PublicKey {
  return kind === "deposit" ? platformKeypair().publicKey : landlordKeypair().publicKey;
}

/**
 * Public origin that wallets will call. SOLANA_PAY_PUBLIC_URL wins (needed behind tunnels or protected previews);
 * otherwise it is derived from the request's forwarding headers.
 */
export function publicOrigin(request: Request): string {
  const fixed = process.env.SOLANA_PAY_PUBLIC_URL?.trim();
  if (fixed) return fixed.replace(/\/+$/, "");
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** `solana:<url-encoded https link>` (transaction request, Solana Pay spec). */
export function transactionRequestUrl(origin: string, ticket: string, label: string): string {
  const link = new URL(`${origin}/api/solana-pay/tx`);
  link.searchParams.set("t", ticket);
  return encodeURL({ link, label }).toString();
}
