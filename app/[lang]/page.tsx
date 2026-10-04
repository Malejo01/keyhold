import { notFound } from "next/navigation";
import { ChatShell } from "@/components/ChatShell";
import { Hero } from "@/components/Hero";
import { getDict, isLang } from "@/lib/i18n";

export default async function Home({ params, searchParams }: PageProps<"/[lang]">) {
  const [{ lang }, query] = await Promise.all([params, searchParams]);
  if (!isLang(lang)) notFound();
  const t = getDict(lang);
  // `?fixtures=1` renders the screen against local fixtures (no backend). The default path calls the real routes.
  const useFixtures = query.fixtures === "1";
  // Carried by the language switcher so a reviewer stays in fixtures mode when changing language.
  const keep = useFixtures ? "?fixtures=1" : "";

  return (
    <main className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Hero targetId="demo" query={keep} />
      {/* The chat section is exactly as tall as the scroll area (viewport minus the demo strip) so it behaves as before once reached. */}
      <section id="demo" aria-label={t.hero.demoRegion} className="flex h-full min-h-0 shrink-0 flex-col">
        {/* Keyed by language: each language keeps its own conversation (the contract text and its hash are per language). */}
        <ChatShell key={lang} useFixtures={useFixtures} query={keep} />
      </section>
    </main>
  );
}
