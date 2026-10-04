import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AgencyLeases } from "@/components/agency/AgencyLeases";
import { AgencyQueue } from "@/components/agency/AgencyQueue";
import { Logo } from "@/components/Logo";
import { Badge } from "@/components/ui";
import { loadQueue } from "@/lib/agency/queue";
import { APP_NAME } from "@/lib/config/brand";
import { getDict, isLang } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps<"/[lang]/agency">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLang(lang)) return {};
  const t = getDict(lang);
  return { title: t.agency.metaTitle(APP_NAME), description: t.agency.metaDescription };
}

// Computed per request on purpose: the queue replays recordings, the ledger reads devnet.
export const dynamic = "force-dynamic";

export default async function AgencyPage({ params, searchParams }: PageProps<"/[lang]/agency">) {
  const [{ lang }, query] = await Promise.all([params, searchParams]);
  if (!isLang(lang)) notFound();
  const t = getDict(lang);
  const other = lang === "en" ? "es" : "en";
  const lease = typeof query.lease === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(query.lease) ? query.lease : undefined;
  const queue = await loadQueue();
  return (
    <main className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-gutter py-4">
          <Link href={`/${lang}`} aria-label={t.agency.homeAria(APP_NAME)} className="rounded-md">
            <Logo />
          </Link>
          <div className="flex items-center gap-4">
            <Link href={`/${lang}`} className="text-sm font-semibold text-accent underline underline-offset-2">
              {t.agency.back}
            </Link>
            <Link
              href={`/${other}/agency${lease ? `?lease=${lease}` : ""}`}
              lang={other}
              hrefLang={other}
              aria-label={t.lang.switchTo[other]}
              title={t.lang.switchTo[other]}
              className="rounded-full border border-border bg-sunken px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-muted hover:text-foreground"
            >
              {other}
            </Link>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-gutter py-8">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight">{t.agency.title}</h1>
            <Badge tone="neutral">{t.agency.demo}</Badge>
          </div>
          <p className="max-w-2xl text-sm text-muted sm:text-base">{t.agency.intro}</p>
        </div>
        <AgencyQueue queue={queue} />
        <AgencyLeases focusLeaseId={lease} />
      </div>
    </main>
  );
}
