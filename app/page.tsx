import { ChatShell } from "@/components/ChatShell";
import { APP_NAME } from "@/lib/config/brand";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  // `?fixtures=1` renders the screen against local fixtures (no backend). The default path calls the real routes.
  const useFixtures = params.fixtures === "1";

  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <h1 className="sr-only">{APP_NAME}, your rental assistant</h1>
      <ChatShell useFixtures={useFixtures} />
    </main>
  );
}
