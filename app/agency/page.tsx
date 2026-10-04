import type { Metadata } from "next";
import Link from "next/link";
import { AgencyLeases } from "@/components/agency/AgencyLeases";
import { AgencyQueue } from "@/components/agency/AgencyQueue";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui";
import { loadQueue } from "@/lib/agency/queue";
import { APP_NAME } from "@/lib/config/brand";

export const metadata: Metadata = {
  title: `Agency panel · ${APP_NAME}`,
  description: "Demo agency view: applications that need information, and contract and payment status read from Solana devnet.",
};

// Computed per request on purpose: the queue replays recordings, the ledger reads devnet.
export const dynamic = "force-dynamic";

export default async function AgencyPage({ searchParams }: PageProps<"/agency">) {
  const params = await searchParams;
  const lease = typeof params.lease === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(params.lease) ? params.lease : undefined;
  const queue = await loadQueue();
  return (
    <main className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-gutter py-4">
          <Link href="/" aria-label={`${APP_NAME} home`} className="rounded-md">
            <Logo />
          </Link>
          <Link href="/" className="text-sm font-semibold text-accent underline underline-offset-2">
            Back to the tenant demo
          </Link>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-gutter py-8">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight">Agency panel</h1>
            <Badge tone="neutral">Demo</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted sm:text-base">
            What a rental agency sees: applications waiting for information, and the contracts and payments recorded on Solana devnet.
            Tenants and documents are simulated; the transactions are real devnet transactions with test tokens.
          </p>
        </div>
        <AgencyQueue queue={queue} />
        <AgencyLeases focusLeaseId={lease} />
      </div>
    </main>
  );
}
