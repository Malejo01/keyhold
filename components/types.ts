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

/** Suggested prompts. Sent verbatim as the user's message; the server decides what they mean. */
export const SUGGESTED_PROMPTS: ReadonlyArray<{ label: string; text: string }> = [
  { label: "Find a place", text: "2-bedroom near Tres Cerritos, under 500 USDC, pets ok" },
  { label: "Book a visit", text: "Book a visit" },
  { label: "Upload my documents", text: "Upload my documents" },
  { label: "Generate the contract", text: "Generate the contract" },
  { label: "Pay the deposit", text: "Pay the deposit" },
  { label: "Pay my first rent", text: "Pay my first rent" },
];

export interface PersistedDemo {
  tenantId: TenantId;
  session?: import("@/lib/contracts").SignedSession;
  messages: ChatMessage[];
  stage: Stage;
}
