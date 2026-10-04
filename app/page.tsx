import { ChatShell } from "@/components/ChatShell";
import { Hero } from "@/components/Hero";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  // `?fixtures=1` renders the screen against local fixtures (no backend). The default path calls the real routes.
  const useFixtures = params.fixtures === "1";

  return (
    <main className="scroll-thin flex min-h-0 flex-1 flex-col overflow-y-auto">
      <Hero targetId="demo" />
      {/* The chat section is exactly as tall as the scroll area (viewport minus the demo strip) so it behaves as before once reached. */}
      <section id="demo" aria-label="Demo" className="flex h-full min-h-0 shrink-0 flex-col">
        <ChatShell useFixtures={useFixtures} />
      </section>
    </main>
  );
}
