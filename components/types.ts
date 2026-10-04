import type { Stage, TenantId, UiCard } from "@/lib/contracts";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: UiCard[];
  /** Rendered with error styling; set for failed requests. */
  error?: boolean;
}

export const PERSONAS: ReadonlyArray<{ id: TenantId; name: string }> = [
  { id: "ana", name: "Ana" },
  { id: "bruno", name: "Bruno" },
  { id: "carla", name: "Carla" },
];

/** Suggested prompts in demo order. The text sent to the server per language lives in lib/i18n/chips.ts (shared with the evals). */
export const CHIP_KEYS = ["find", "visit", "docs", "contract", "deposit", "rent"] as const;
export type ChipKey = (typeof CHIP_KEYS)[number];

export interface PersistedDemo {
  tenantId: TenantId;
  session?: import("@/lib/contracts").SignedSession;
  messages: ChatMessage[];
  stage: Stage;
}
