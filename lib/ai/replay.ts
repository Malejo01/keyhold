import { RECORDINGS } from '../../evals/recordings';
import type { Recording } from './types';

/**
 * Replay store. Recordings are bundled through a generated static index
 * (evals/recordings/index.ts) so they also work on serverless deploys without fs access.
 */
let byKey: Map<string, Recording> | null = null;

export function findRecording(key: string): Recording | undefined {
  byKey ??= new Map(RECORDINGS.map((r) => [r.key, r]));
  return byKey.get(key);
}

export type RecordingSink = (recording: Recording) => void | Promise<void>;

let sink: RecordingSink | null = null;

/** evals/record.ts installs a sink to collect recordings while RECORD=1. */
export function setRecordingSink(next: RecordingSink | null): void {
  sink = next;
}

export async function emitRecording(recording: Recording): Promise<void> {
  if (sink) await sink(recording);
}
