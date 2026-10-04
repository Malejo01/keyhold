import type { Stage, UiCard } from "@/lib/contracts";
import type { Dict } from "@/lib/i18n";
import { stageIndex, STAGE_ORDER } from "./stages";
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

function lastCard<T extends UiCard["type"]>(cards: UiCard[], type: T): Extract<UiCard, { type: T }> | undefined {
  for (let i = cards.length - 1; i >= 0; i--) {
    const c = cards[i];
    if (c.type === type) return c as Extract<UiCard, { type: T }>;
  }
  return undefined;
}

/** Derives what each product agent did from the cards the server returned. No extra API. */
export function deriveActivity(messages: ChatMessage[], pending: boolean, stage: Stage, t: Dict): AgentRow[] {
  const a = t.agents;
  const cards = messages.flatMap((m) => m.cards ?? []);
  const props = lastCard(cards, "properties");
  const searchSize = cards.reduce((n, c) => (c.type === "properties" ? Math.max(n, c.properties.length) : n), 0);
  const prequal = lastCard(cards, "prequal");
  const contract = lastCard(cards, "contract");

  const ids: AgentId[] = ["orchestrator", "listings", "prequal", "crosscheck", "lease"];
  const rows: AgentRow[] = ids.map((id) => ({ id, ...a.meta[id], state: "idle" }));
  const row = (id: AgentId) => rows.find((r) => r.id === id)!;

  if (messages.length > 0) {
    const o = row("orchestrator");
    o.state = pending ? "working" : "done";
    o.summary = pending ? a.routing : a.routed(t.stages[STAGE_ORDER[stageIndex(stage)]].label);
  }
  if (props) {
    const n = props.properties.length;
    const r = row("listings");
    r.state = "done";
    r.summary = n < searchSize ? a.listingSingle(searchSize) : a.listingFound(n);
  }
  if (prequal) {
    const d = prequal.decision;
    const docs = d.prequal.extracted.documentsPresent.length;
    const p = row("prequal");
    p.state = "done";
    p.summary = a.prequalChecked(docs, d.prequal.status === "APPROVED");
    p.tone = d.prequal.status === "APPROVED" ? "ok" : "warn";
    const c = row("crosscheck");
    c.state = "done";
    c.summary = a.crosscheckRead(d.crosscheck.agrees);
    c.tone = d.crosscheck.agrees ? "ok" : "warn";
  }
  if (contract) {
    const l = row("lease");
    l.state = "done";
    l.summary = a.leaseDrafted(contract.lease.contractHash.slice(0, 8));
    l.tone = "ok";
  }
  return rows;
}
