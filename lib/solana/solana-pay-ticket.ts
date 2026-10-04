// Server-only: signed "payment tickets" for Solana Pay transaction requests.
//
// A wallet calls our tx endpoint without any cookie or session, so the endpoint needs a self-contained,
// tamper-proof description of what to charge. The ticket is that description: the server-derived
// PaymentIntent (from the HMAC-signed session's lease), the unique `reference` pubkey, the session id and an
// expiry, all covered by an HMAC. The client can carry it in a URL but cannot alter any field of it.
// The HMAC key is derived from SESSION_SECRET with a domain separator, so a ticket is never a valid session
// signature and vice versa.
import { createHmac, timingSafeEqual } from "node:crypto";
import { Keypair, PublicKey } from "@solana/web3.js";
import { z } from "zod";
import type { PaymentIntent, TenantId } from "../contracts";

export const TICKET_TTL_SECONDS = 15 * 60;
const MIN_SECRET_LENGTH = 32;
const DOMAIN = "solana-pay-ticket:v1";
const HASH_RE = /^[0-9a-f]{64}$/;

/** Bad, tampered or expired ticket. Routes map it to HTTP 401 / 410. */
export class InvalidTicketError extends Error {
  constructor(
    message: string,
    readonly expired = false,
  ) {
    super(message);
    this.name = "InvalidTicketError";
  }
}

export interface TicketPayload {
  sessionId: string;
  /** Unique reference pubkey (base58). Generated server-side, bound to this payload by the HMAC. */
  reference: string;
  /** Unix seconds. */
  expiresAt: number;
  intent: PaymentIntent;
}

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SESSION_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters long`);
  }
  return createHmac("sha256", secret).update(DOMAIN).digest();
}

function mac(body: string): Buffer {
  return createHmac("sha256", key()).update(body).digest();
}

// Compact positional encoding keeps the QR small. Order is part of the format (v1).
const wire = z.tuple([
  z.literal(1),
  z.string().min(1).max(64), // sessionId
  z.string().min(32).max(44), // reference
  z.number().int().positive(), // expiresAt
  z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), // leaseId
  z.union([z.literal(0), z.literal(1)]), // kind: 0 deposit, 1 rent
  z.number().int().min(-1).max(1200), // monthIndex or -1
  z.enum(["ana", "bruno", "carla"]),
  z.string().regex(/^[0-9]{1,20}$/), // list amount base units
  z.number().int().min(0).max(10_000),
  z.number().int().min(0).max(10_000),
  z.number().int().positive(), // dueTs
  z.string().length(43), // contract hash, base64url of the 32 bytes
]);

function toWire(p: TicketPayload) {
  const { intent } = p;
  return [
    1,
    p.sessionId,
    p.reference,
    p.expiresAt,
    intent.leaseId,
    intent.kind === "deposit" ? 0 : 1,
    intent.monthIndex ?? -1,
    intent.payer,
    intent.listAmountBaseUnits,
    intent.discountUsdcBps,
    intent.discountOntimeBps,
    intent.dueTs,
    Buffer.from(intent.contractHash, "hex").toString("base64url"),
  ];
}

export function encodeTicket(payload: TicketPayload): string {
  if (!HASH_RE.test(payload.intent.contractHash)) throw new Error("Invalid contractHash.");
  const body = Buffer.from(JSON.stringify(toWire(payload)), "utf8").toString("base64url");
  return `${body}.${mac(body).toString("base64url")}`;
}

/** Verifies the HMAC, the shape and the expiry. `nowSec` is server time. */
export function decodeTicket(token: string, nowSec: number): TicketPayload {
  const parts = typeof token === "string" ? token.split(".") : [];
  if (parts.length !== 2 || token.length > 2048) throw new InvalidTicketError("Malformed ticket");
  const [body, sig] = parts;
  const expected = mac(body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(expected, given)) {
    throw new InvalidTicketError("Invalid ticket signature");
  }
  let parsed: z.infer<typeof wire>;
  try {
    parsed = wire.parse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    new PublicKey(parsed[2]);
  } catch {
    throw new InvalidTicketError("Malformed ticket");
  }
  const [, sessionId, reference, expiresAt, leaseId, kind, month, payer, list, usdcBps, ontimeBps, dueTs, hash] = parsed;
  if (expiresAt <= nowSec) throw new InvalidTicketError("Ticket expired", true);
  const intent: PaymentIntent = {
    leaseId,
    kind: kind === 0 ? "deposit" : "rent",
    payer: payer as TenantId,
    listAmountBaseUnits: list,
    contractHash: Buffer.from(hash, "base64url").toString("hex"),
    dueTs,
    discountUsdcBps: usdcBps,
    discountOntimeBps: ontimeBps,
  };
  if (kind === 1) {
    if (month < 0) throw new InvalidTicketError("Malformed ticket");
    intent.monthIndex = month;
  }
  return { sessionId, reference, expiresAt, intent };
}

/** Fresh unique reference (the secret half is discarded: nobody ever signs with it). */
export function newReference(): PublicKey {
  return Keypair.generate().publicKey;
}

export function mintTicket(params: { sessionId: string; intent: PaymentIntent; nowSec: number }): {
  ticket: string;
  reference: string;
  expiresAt: number;
} {
  const reference = newReference().toBase58();
  const expiresAt = params.nowSec + TICKET_TTL_SECONDS;
  const ticket = encodeTicket({ sessionId: params.sessionId, reference, expiresAt, intent: params.intent });
  return { ticket, reference, expiresAt };
}
