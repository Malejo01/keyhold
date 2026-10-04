/**
 * Devnet check of the on-chain release idempotency (B6 review, B1).
 * Fires TWO releases for the same lease at the same time from two different processes' worth of state:
 * one POST to a running server (BASE_URL) and one direct releaseDeposit() call in this process. Exactly one must
 * land; the other must be refused with 409 "Already released". Spends at most one devnet transaction (the winner)
 * plus, if both pass the pre-check, one failed duplicate that the cluster rejects.
 *
 * Usage: BASE_URL=http://localhost:3006 pnpm tsx scripts/agency-release-race.ts <leaseId>
 * The lease needs a confirmed deposit from a demo tenant (the phase 0 e2e creates one). Devnet only.
 */
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv({ path: resolve(process.cwd(), ".env.local"), quiet: true });

async function main(): Promise<void> {
  const leaseId = process.argv[2];
  if (!leaseId || !/^[A-Za-z0-9_-]{1,64}$/.test(leaseId)) throw new Error("Usage: pnpm tsx scripts/agency-release-race.ts <leaseId>");
  const base = process.env.BASE_URL ?? "http://localhost:3006";
  const { releaseDeposit } = await import("../lib/agency/release");
  const { loadLeaseForRelease } = await import("../lib/agency/chain");

  const found = await loadLeaseForRelease(leaseId);
  const deposit = found.lease?.deposit?.amount;
  if (!deposit) throw new Error("This lease has no readable deposit.");
  const body = { leaseId, toTenant: deposit, toLandlord: "0", reason: "race check", approver: "tenant" };

  const viaServer = fetch(`${base}/api/agency/release`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (res) => ({ via: "server", status: res.status, body: await res.json() as Record<string, unknown> }));
  const direct = releaseDeposit(body as Parameters<typeof releaseDeposit>[0]).then(
    (r) => ({ via: "direct", status: 200, body: { signature: r.signature, explorerUrl: r.explorerUrl } as Record<string, unknown> }),
    (e: unknown) => ({
      via: "direct",
      status: (e as { status?: number }).status ?? 500,
      body: { error: (e as Error).message, explorerUrl: (e as { explorerUrl?: string }).explorerUrl } as Record<string, unknown>,
    }),
  );
  const results = await Promise.all([viaServer, direct]);
  for (const r of results) console.log(r.via, r.status, JSON.stringify(r.body));
  const landed = results.filter((r) => r.status === 200).length;
  const refused = results.filter((r) => r.status === 409).length;
  console.log(`landed=${landed} refused=${refused}`);
  process.exit(landed === 1 && refused === 1 ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
