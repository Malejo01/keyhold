import { z } from 'zod';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { replayKey } from './hash';
import { modelFor, selectedProviderName } from './models';
import { withRetry } from './retry';
import { emitRecording, findRecording } from './replay';
import type { AiBlock, AiMessage, AiProvider, AiSource, ChatStepResult, ModelRole, Recording, ToolDefinition } from './types';

export type { AiBlock, AiMessage, AiSource, ChatStepResult, ModelRole, ToolDefinition } from './types';
export { AiRefusalError } from './errors';
export { selectedProviderName } from './models';

/**
 * Facade used by every product agent.
 *  - REPLAY=1: serve recordings from evals/recordings, never call a model.
 *  - Provider: AI_PROVIDER=gemini|anthropic (default gemini). Clients are created lazily, so a missing key never
 *    throws at import time.
 *  - No API key for the selected provider: same as REPLAY=1 (the demo keeps working offline).
 *  - Otherwise live (429/5xx retried with backoff); with RECORD=1 every live response is emitted to the recording sink.
 *  - If a live call still fails, the recording for the same input is served when one exists, so the demo cannot die
 *    on a rate limit. AI_STRICT_LIVE=1 (evals, record) disables that fallback.
 */

const providers: Record<'gemini' | 'anthropic', AiProvider> = {
  gemini: new GeminiProvider(),
  anthropic: new AnthropicProvider(),
};
let providerOverride: AiProvider | null = null;

/** Swap the provider (tests, hand-authored recordings). */
export function setProvider(provider: AiProvider | null): void {
  providerOverride = provider;
}

function provider(): AiProvider {
  return providerOverride ?? providers[selectedProviderName()];
}

function strictLive(): boolean {
  return process.env.AI_STRICT_LIVE === '1';
}

/** Live call failed after retries: serve the recording for this key if there is one, otherwise rethrow. */
function recordingFallback(err: unknown, agent: string, key: string, kind: Recording['kind']): Recording {
  const rec = strictLive() ? undefined : findRecording(key);
  if (!rec || rec.kind !== kind) throw err;
  console.warn(`[ai] ${agent}: live call failed (${err instanceof Error ? err.message.slice(0, 160) : String(err)}); serving recording.`);
  return rec;
}

export type AiMode = 'live' | 'replay';

/** Human-readable provider/model summary, e.g. for eval logs. */
export function aiDescribe(): string {
  const p = provider();
  return `${p.name} (orchestration ${modelFor('orchestration', p.name)}, extraction ${modelFor('extraction', p.name)})`;
}

/**
 * Daily cap on live model calls (AI_DAILY_CALL_CAP, default 300, UTC day). Once reached, the app serves recordings.
 * Counted in memory, so on serverless it is per warm instance: a cost guard, not an exact quota.
 */
const liveCalls = { day: '', count: 0 };
function dailyCap(): number {
  const cap = Number.parseInt(process.env.AI_DAILY_CALL_CAP ?? '', 10);
  return Number.isFinite(cap) && cap >= 0 ? cap : 300;
}
function capReached(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (liveCalls.day !== today) {
    liveCalls.day = today;
    liveCalls.count = 0;
  }
  return liveCalls.count >= dailyCap();
}
/** Wraps one provider request so every attempt, retries included, counts against the cap. */
function counted<T>(call: () => Promise<T>): () => Promise<T> {
  return () => {
    liveCalls.count += 1;
    return call();
  };
}

export function aiMode(): AiMode {
  if (process.env.REPLAY === '1') return 'replay';
  if (!provider().isConfigured()) return 'replay';
  return capReached() ? 'replay' : 'live';
}

export class ReplayMissError extends Error {
  constructor(
    readonly agent: string,
    readonly key: string,
  ) {
    super(`No recording for agent "${agent}" (key ${key.slice(0, 12)}). Run evals/record.ts with a live API key.`);
    this.name = 'ReplayMissError';
  }
}

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

// Live-mode memo so a server re-check (e.g. /api/lease re-running evaluateTenant) does not pay twice.
const MEMO_LIMIT = 200;
const memo = new Map<string, unknown>();
function remember(key: string, value: unknown): void {
  if (memo.size >= MEMO_LIMIT) memo.delete(memo.keys().next().value as string);
  memo.set(key, value);
}

async function record(rec: Omit<Recording, 'source' | 'recordedAt'>): Promise<void> {
  if (process.env.RECORD !== '1') return;
  await emitRecording({
    ...rec,
    provider: provider().name,
    source: provider().name === 'hand-authored' ? 'hand-authored' : 'recorded',
    recordedAt: new Date().toISOString(),
  });
}

export interface StructuredOptions<T> {
  /** Stable agent id, part of the replay key, e.g. 'prequal.extract'. */
  agent: string;
  role: ModelRole;
  system: string;
  /** User content. Part of the replay key. */
  input: string;
  schema: z.ZodType<T>;
  label?: string;
  maxTokens?: number;
}

export async function generateStructured<T>(opts: StructuredOptions<T>): Promise<{ data: T; source: AiSource }> {
  const key = replayKey(opts.agent, opts.input);
  if (aiMode() === 'replay') {
    const rec = findRecording(key);
    if (!rec || rec.kind !== 'structured') throw new ReplayMissError(opts.agent, key);
    return { data: opts.schema.parse(rec.output), source: 'replay' };
  }
  if (process.env.AI_MEMO !== '0' && memo.has(key)) return { data: opts.schema.parse(memo.get(key)), source: 'live' };

  const p = provider();
  const model = modelFor(opts.role, p.name);
  const call = {
    model,
    system: opts.system,
    user: opts.input,
    jsonSchema: toJsonSchema(opts.schema),
    maxTokens: opts.maxTokens ?? 2000,
  };
  let raw: unknown;
  let data: T;
  try {
    raw = await withRetry(opts.agent, counted(() => p.generateJson(call)));
    let parsed = opts.schema.safeParse(raw);
    if (!parsed.success) {
      // One retry: structured outputs should make this rare.
      raw = await withRetry(opts.agent, counted(() => p.generateJson(call)));
      parsed = opts.schema.safeParse(raw);
      if (!parsed.success) throw parsed.error;
    }
    data = parsed.data;
  } catch (err) {
    const rec = recordingFallback(err, opts.agent, key, 'structured');
    return { data: opts.schema.parse(rec.output), source: 'replay' };
  }
  remember(key, raw);
  await record({ key, agent: opts.agent, kind: 'structured', label: opts.label, model, output: raw });
  return { data, source: 'live' };
}

/** Replay key view of a conversation: ids and provider-specific blocks removed. */
function keyView(messages: AiMessage[]): unknown {
  return messages.map((m) => ({
    role: m.role,
    content: m.content.flatMap((b): unknown[] => {
      if (b.type === 'text') return [{ text: b.text.trim() }];
      if (b.type === 'tool_use') return [{ tool: b.name, input: b.input }];
      if (b.type === 'tool_result') return [{ result: b.content, isError: Boolean(b.isError) }];
      return [];
    }),
  }));
}

export interface ChatStepOptions {
  agent: string;
  role: ModelRole;
  system: string;
  messages: AiMessage[];
  tools: ToolDefinition[];
  label?: string;
  maxTokens?: number;
}

export async function chatStep(opts: ChatStepOptions): Promise<ChatStepResult & { source: AiSource }> {
  const key = replayKey(opts.agent, keyView(opts.messages));
  if (aiMode() === 'replay') {
    const rec = findRecording(key);
    if (!rec || rec.kind !== 'chat_step') throw new ReplayMissError(opts.agent, key);
    return { ...(rec.output as ChatStepResult), source: 'replay' };
  }
  const p = provider();
  const model = modelFor(opts.role, p.name);
  let result: ChatStepResult;
  try {
    result = await withRetry(
      opts.agent,
      counted(() =>
      p.chatStep({
        model,
        system: opts.system,
        messages: opts.messages,
        tools: opts.tools,
        maxTokens: opts.maxTokens ?? 4000,
      })),
    );
  } catch (err) {
    const rec = recordingFallback(err, opts.agent, key, 'chat_step');
    return { ...(rec.output as ChatStepResult), source: 'replay' };
  }
  // Provider-specific blocks are not portable: keep them out of recordings.
  const portable: ChatStepResult = {
    stopReason: result.stopReason,
    content: result.content.filter((b): b is Exclude<AiBlock, { type: 'provider_opaque' }> => b.type !== 'provider_opaque'),
  };
  await record({ key, agent: opts.agent, kind: 'chat_step', label: opts.label, model, output: portable });
  return { ...result, source: 'live' };
}
