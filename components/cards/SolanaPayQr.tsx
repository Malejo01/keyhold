"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PayResponse, PaymentKind, SignedSession } from "@/lib/contracts";
import { useI18n } from "../I18nProvider";
import { Button, AlertIcon, ShieldIcon } from "../ui";

/** Feature flag, inlined at build time. Off unless NEXT_PUBLIC_SOLANA_PAY=1. */
export const SOLANA_PAY_ENABLED = process.env.NEXT_PUBLIC_SOLANA_PAY === "1";

const POLL_MS = 2500;
/** The tx endpoint stops building at ticket expiry; a built tx stays valid ~90 s longer. */
const EXPIRY_SLACK_S = 90;

interface Ticket {
  ticket: string;
  url: string;
  expiresAt: number;
}

type Phase = "closed" | "loading" | "waiting" | "expired" | "error";

async function postJson<T>(url: string, body: unknown, failed: (status: number) => string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(data?.error ?? failed(res.status));
  return data as T;
}

/** QR as inline SVG. Modules are drawn as one path; the quiet zone is part of the viewBox. */
function QrSvg({ text, label }: { text: string; label: string }) {
  const [paths, setPaths] = useState<{ d: string; size: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Loaded on demand: the QR library never ships in the default bundle path.
    void import("qrcode").then((QRCode) => {
      if (cancelled) return;
      const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
      const size = qr.modules.size;
      let d = "";
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (qr.modules.data[y * size + x]) d += `M${x} ${y}h1v1h-1z`;
        }
      }
      setPaths({ d, size });
    });
    return () => {
      cancelled = true;
    };
  }, [text]);

  const quiet = 4;
  const size = paths?.size ?? 0;
  return (
    // Scanners need dark modules on a light tile in both themes, so this tile is deliberately not themed.
    <div className="rounded-md bg-white p-1 text-black">
      <svg
        role="img"
        aria-label={label}
        viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`}
        className="size-48 sm:size-56"
        shapeRendering="crispEdges"
      >
        {paths && <path d={paths.d} fill="currentColor" />}
      </svg>
    </div>
  );
}

/**
 * "Pay with a wallet" block of the payment card. Asks the server for a ticket (amount, memo and reference are all
 * server-side), shows the Solana Pay QR, then polls the status endpoint until the payment is confirmed on devnet.
 */
export function SolanaPayQr({
  kind,
  getSession,
  onConfirmed,
}: {
  kind: PaymentKind;
  getSession: () => SignedSession | undefined;
  /** Called once with the server's receipt and the updated signed session. */
  onConfirmed: (res: PayResponse) => void;
}) {
  const { t } = useI18n();
  const sp = t.solanaPay;
  const [phase, setPhase] = useState<Phase>("closed");
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);
  // Latest callbacks in refs, so a parent re-render never restarts the polling loop.
  const getSessionRef = useRef(getSession);
  const onConfirmedRef = useRef(onConfirmed);
  useEffect(() => {
    getSessionRef.current = getSession;
    onConfirmedRef.current = onConfirmed;
  });

  const open = useCallback(async () => {
    const session = getSessionRef.current();
    if (!session) {
      setError(sp.startFirst);
      setPhase("error");
      return;
    }
    setPhase("loading");
    setError(null);
    done.current = false;
    try {
      const t = await postJson<Ticket>("/api/solana-pay/ticket", { kind, session }, sp.requestFailed);
      setTicket(t);
      setPhase("waiting");
    } catch (err) {
      setError(err instanceof Error ? err.message : sp.createFailed);
      setPhase("error");
    }
  }, [kind, sp]);

  useEffect(() => {
    if (phase !== "waiting" || !ticket) return;
    let stopped = false;
    let busy = false;
    const timer = setInterval(async () => {
      if (stopped || busy || done.current) return;
      if (Date.now() / 1000 > ticket.expiresAt + EXPIRY_SLACK_S) {
        setPhase("expired");
        return;
      }
      const session = getSessionRef.current();
      if (!session) return;
      busy = true;
      try {
        const res = await postJson<{ status: "pending" } | ({ status: "confirmed" } & PayResponse)>(
          "/api/solana-pay/status",
          { ticket: ticket.ticket, session },
          sp.requestFailed,
        );
        if (stopped || done.current) return;
        if (res.status === "confirmed") {
          done.current = true;
          onConfirmedRef.current({ result: res.result, session: res.session });
        }
      } catch {
        // Transient network or RPC error: keep polling until the ticket expires.
      } finally {
        busy = false;
      }
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [phase, ticket, sp]);

  if (phase === "closed") {
    return (
      <Button variant="secondary" onClick={() => void open()} className="w-full sm:w-auto sm:self-start">
        <ShieldIcon className="size-4" />
        {sp.button}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-sunken p-3">
      {phase === "loading" && <p className="text-sm text-muted">{sp.creating}</p>}

      {phase === "waiting" && ticket && (
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <QrSvg text={ticket.url} label={sp.qrLabel} />
          <div className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">{sp.scan}</p>
            <p className="text-muted">{sp.walletNote}</p>
            <a
              href={ticket.url}
              className="self-start font-semibold text-primary underline-offset-2 hover:underline"
            >
              {sp.openWallet}
            </a>
            <p className="text-muted" aria-live="polite">
              {sp.waiting}
            </p>
          </div>
        </div>
      )}

      {(phase === "expired" || phase === "error") && (
        <div className="flex flex-col gap-2">
          <p className="flex items-start gap-1.5 text-sm text-danger">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            {phase === "expired" ? sp.expired : error}
          </p>
          <Button variant="secondary" onClick={() => void open()} className="self-start">
            {sp.newQr}
          </Button>
        </div>
      )}

    </div>
  );
}
