import type { Stage } from "@/lib/contracts";

/** Display order of the lease stages (labels and hints live in the dictionaries). The stage itself comes from the server. */
export const STAGE_ORDER: ReadonlyArray<Stage> = ["SEARCH", "VISIT", "DOCUMENTS", "CONTRACT", "PAYMENT", "ACTIVE", "MOVE_OUT"];

export function stageIndex(stage: Stage): number {
  return Math.max(0, STAGE_ORDER.indexOf(stage));
}
