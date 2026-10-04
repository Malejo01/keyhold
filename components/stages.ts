import type { Stage } from "@/lib/contracts";

/** Human labels for the lease stages. The order here is only for display; the stage itself comes from the server. */
export const STAGES: ReadonlyArray<{ stage: Stage; label: string; hint: string }> = [
  { stage: "SEARCH", label: "Search", hint: "Find a place that fits" },
  { stage: "VISIT", label: "Visit", hint: "Confirm a viewing" },
  { stage: "DOCUMENTS", label: "Documents", hint: "Pre-qualification check" },
  { stage: "CONTRACT", label: "Contract", hint: "Review and verify the text" },
  { stage: "PAYMENT", label: "Payment", hint: "Deposit and rent" },
  { stage: "ACTIVE", label: "Active lease", hint: "Rent payments on record" },
  { stage: "MOVE_OUT", label: "Move-out", hint: "Deposit return (coming next)" },
];

export function stageIndex(stage: Stage): number {
  return Math.max(
    0,
    STAGES.findIndex((s) => s.stage === stage),
  );
}
