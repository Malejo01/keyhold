import type { en } from "./en";

/** Shape of every dictionary. `en.ts` defines it; `es.ts` must match it exactly. */
export type Dict = typeof en;
