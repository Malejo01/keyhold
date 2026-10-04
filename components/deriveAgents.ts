import type { Stage, UiCard } from "@/lib/contracts";
import { STAGES, stageIndex } from "./stages";
import type { ChatMessage } from "./types";

export type AgentId = "orchestrator" | "listings" | "prequal" | "crosscheck" | "lease";
export type AgentTone = "ok" | "warn";

export interface AgentRow {
  id: AgentId;
  name: string;
  role: string;
  state: "idle" | "working" | "done";
  /** One line of what the agent did. Undefined until it acted. */
  summary?: string;
  tone?: AgentTone;
}

const META: Record<AgentId, { name: string; role: string }> = {
  orchestrator: { name: "Orchestrator", role: "Routes each request" },
  listings: { name: "Listings", role: "Searches the catalog" },
  prequal: { name: "Pre-qualification", role: "Reads the documents" },
  crosscheck: { name: "Cross-check", role: "Reviews the first result" },
  lease: { name: "Lease", role: "Drafts the contract" },
};

function lastCard<T extends UiCard["type"]>(cards: UiCard[], type: T): Extract<UiCard, { type: T }> | undefined {
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (c.type === type) return c as Extract<UiCard, { type: T }>;
  }
  return undefined;
}

/** Derives what each product agent did from the cards the server returned. No extra API. */
export function deriveActivity(messages: ChatMessage[], pending: boolean, stage: Stage): AgentRow[] {
  const cards = messages.flatMap((m) => m.cards ?? []);
  const props = lastCard(cards, "properties");
  const searchSize = cards.reduce((n, c) => (c.type === "properties" ? Math.max(n, c.properties.length) : n), 0);
  const prequal = lastCard(cards, "prequal");
  const contract = lastCard(cards, "contract");

  const rows: AgentRow[] = (Object.keys(META) as AgentId[]).map((id) => ({ id, ...META[id], state: "idle" }));
  const row = (id: AgentId) => rows.find((r) => r.id === id)!;

  if (messages.length > 0) {
    const o = row("orchestrator");
    o.state = pending ? "working" : "done";
    o.summary = pending
      ? "Working out the next step"
      : `Routed your request · now: ${STAGES[stageIndex(stage)].label}`;
  }
  if (props) {
    const n = props.properties.length;
    const r = row("listings");
    r.state = "done";
    r.summary =
      n < searchSize
        ? `Showing your chosen listing (1 of ${searchSize})`
        : `Found ${n} ${n === 1 ? "listing" : "listings"} in the catalog`;
  }
  if (prequal) {
    const d = prequal.decision;
    const docs = d.prequal.extracted.documentsPresent.length;
    const p = row("prequal");
    p.state = "done";
    p.summary = `Checked ${docs} ${docs === 1 ? "document" : "documents"} → ${
      d.prequal.status === "APPROVED" ? "Approved" : "Needs info"
    }`;
    p.tone = d.prequal.status === "APPROVED" ? "ok" : "warn";
    const c = row("crosscheck");
    c.state = "done";
    c.summary = `Re-read the documents independently → ${d.crosscheck.agrees ? "agrees" : "found a mismatch"}`;
    c.tone = d.crosscheck.agrees ? "ok" : "warn";
  }
  if (contract) {
    const l = row("lease");
    l.state = "done";
    l.summary = `Drafted the contract · SHA-256 ${contract.lease.contractHash.slice(0, 8)}…`;
    l.tone = "ok";
  }
  return rows;
}
