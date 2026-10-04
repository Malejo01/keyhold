import { z } from 'zod';
import { AnthropicProvider } from './anthropic';
import { replayKey } from './hash';
import { modelFor } from './models';
import { emitRecording, findRecording } from './replay';
import type { AiBlock, AiMessage, AiProvider, AiSource, ChatStepResult, ModelRole, Recording, ToolDefinition } from './types';

export type { AiBlock, AiMessage, AiSource, ChatStepResult, ModelRole, ToolDefinition } from './types';
export { AiRefusalError } from './anthropic';

/**
 * Facade used by every product agent.
 *  - REPLAY=1: serve recordings from evals/recordings, never call a model.
 *  - No API key configured: same as REPLAY=1 (the demo keeps working offline).
 *  - Otherwise live; with RECORD=1 every live response is emitted to the recording sink.
 */

const anthropic = new AnthropicProvider();
let providerOverride: AiProvider | null = null;

/** Swap the provider (tests, hand-authored recordings, a future Gemini provider). */
export function setProvider(provider: AiProvider | null): void {
  providerOverride = provider;
}

function provider(): AiProvider {
  return providerOverride ?? anthropic;
}

export type AiMode = 'live' | 'replay';

export function aiMode(): AiMode {
  if (process.env.REPLAY === '1') return 'replay';
  return provider().isConfigured() ? 'live' : 'replay';
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
  if (memo.has(key)) return { data: opts.schema.parse(memo.get(key)), source: 'live' };

  const model = modelFor(opts.role);
  const call = {
    model,
    system: opts.system,
    user: opts.input,
    jsonSchema: toJsonSchema(opts.schema),
    maxTokens: opts.maxTokens ?? 2000,
  };
  let raw = await provider().generateJson(call);
  let parsed = opts.schema.safeParse(raw);
  if (!parsed.success) {
    // One retry: structured outputs should make this rare.
    raw = await provider().generateJson(call);
    parsed = opts.schema.safeParse(raw);
    if (!parsed.success) throw parsed.error;
  }
  remember(key, raw);
  await record({ key, agent: opts.agent, kind: 'structured', label: opts.label, model, output: raw });
  return { data: parsed.data, source: 'live' };
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
  const model = modelFor(opts.role);
  const result = await provider().chatStep({
    model,
    system: opts.system,
    messages: opts.messages,
    tools: opts.tools,
    maxTokens: opts.maxTokens ?? 4000,
  });
  // Provider-specific blocks are not portable: keep them out of recordings.
  const portable: ChatStepResult = {
    stopReason: result.stopReason,
    content: result.content.filter((b): b is Exclude<AiBlock, { type: 'provider_opaque' }> => b.type !== 'provider_opaque'),
  };
  await record({ key, agent: opts.agent, kind: 'chat_step', label: opts.label, model, output: portable });
  return { ...result, source: 'live' };
}
