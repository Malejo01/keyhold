import { FinishReason, GoogleGenAI, ThinkingLevel, type Content, type GenerateContentResponse, type Part } from '@google/genai';
import { AiRefusalError } from './errors';
import type { AiBlock, AiMessage, AiProvider, ChatStepCall, ChatStepResult, StopReason, StructuredCall } from './types';

/** Prefix for ids we synthesize when Gemini returns a function call without an id. */
const LOCAL_ID_PREFIX = 'gemini_call_';
/** Documented placeholder for function-call parts the model did not produce in this conversation (e.g. replayed). */
const SKIP_SIGNATURE = 'skip_thought_signature_validator';
/** Thinking tokens count against maxOutputTokens; keep room so JSON is never truncated. */
const THINKING_HEADROOM = 4096;

function apiKey(): string | undefined {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || undefined;
}

function thinkingLevel(): ThinkingLevel {
  const v = (process.env.GEMINI_THINKING_LEVEL || 'LOW').toUpperCase();
  if (v === 'MINIMAL') return ThinkingLevel.MINIMAL;
  if (v === 'MEDIUM') return ThinkingLevel.MEDIUM;
  if (v === 'HIGH') return ThinkingLevel.HIGH;
  return ThinkingLevel.LOW;
}

const REFUSAL_REASONS = new Set<string>([
  FinishReason.SAFETY,
  FinishReason.PROHIBITED_CONTENT,
  FinishReason.BLOCKLIST,
  FinishReason.SPII,
  FinishReason.RECITATION,
]);

function checkBlocked(res: GenerateContentResponse): void {
  if (res.promptFeedback?.blockReason) throw new AiRefusalError(`Prompt blocked: ${res.promptFeedback.blockReason}`);
  const reason = res.candidates?.[0]?.finishReason;
  if (reason && REFUSAL_REASONS.has(reason)) throw new AiRefusalError(`Response blocked: ${reason}`);
}

/** Converts neutral messages to Gemini contents. Raw model contents (with thought signatures) are sent back as-is. */
function toContents(messages: AiMessage[]): Content[] {
  const toolNames = new Map<string, string>();
  for (const m of messages) for (const b of m.content) if (b.type === 'tool_use') toolNames.set(b.id, b.name);

  return messages.map((m): Content => {
    if (m.role === 'assistant') {
      const opaque = m.content.find((b) => b.type === 'provider_opaque' && b.provider === 'gemini');
      if (opaque && opaque.type === 'provider_opaque') return opaque.raw as Content;
      const parts: Part[] = m.content.flatMap((b): Part[] => {
        if (b.type === 'text') return b.text ? [{ text: b.text }] : [];
        if (b.type === 'tool_use') {
          const id = b.id.startsWith(LOCAL_ID_PREFIX) ? undefined : b.id;
          return [{ functionCall: { id, name: b.name, args: b.input }, thoughtSignature: SKIP_SIGNATURE }];
        }
        return [];
      });
      return { role: 'model', parts };
    }
    const parts: Part[] = m.content.flatMap((b): Part[] => {
      if (b.type === 'text') return [{ text: b.text }];
      if (b.type === 'tool_result') {
        const id = b.toolUseId.startsWith(LOCAL_ID_PREFIX) ? undefined : b.toolUseId;
        const name = toolNames.get(b.toolUseId) ?? 'unknown_tool';
        return [{ functionResponse: { id, name, response: b.isError ? { error: b.content } : { output: b.content } } }];
      }
      return [];
    });
    return { role: 'user', parts };
  });
}

function mapStop(res: GenerateContentResponse, hasToolUse: boolean): StopReason {
  if (hasToolUse) return 'tool_use';
  const reason = res.candidates?.[0]?.finishReason;
  if (reason === FinishReason.STOP) return 'end_turn';
  if (reason === FinishReason.MAX_TOKENS) return 'max_tokens';
  if (reason && REFUSAL_REASONS.has(reason)) return 'refusal';
  return 'other';
}

export class GeminiProvider implements AiProvider {
  readonly name = 'gemini';
  private client: GoogleGenAI | null = null;

  isConfigured(): boolean {
    return Boolean(apiKey());
  }

  private sdk(): GoogleGenAI {
    this.client ??= new GoogleGenAI({ apiKey: apiKey(), httpOptions: { timeout: 60_000 } });
    return this.client;
  }

  async generateJson(call: StructuredCall): Promise<unknown> {
    const res = await this.sdk().models.generateContent({
      model: call.model,
      contents: [{ role: 'user', parts: [{ text: call.user }] }],
      config: {
        systemInstruction: call.system,
        maxOutputTokens: call.maxTokens + THINKING_HEADROOM,
        responseMimeType: 'application/json',
        responseJsonSchema: call.jsonSchema,
        thinkingConfig: { thinkingLevel: thinkingLevel() },
      },
    });
    checkBlocked(res);
    const text = res.text;
    if (!text) throw new Error(`Gemini returned no text (finishReason ${res.candidates?.[0]?.finishReason ?? 'unknown'}).`);
    return JSON.parse(text) as unknown;
  }

  async chatStep(call: ChatStepCall): Promise<ChatStepResult> {
    const res = await this.sdk().models.generateContent({
      model: call.model,
      contents: toContents(call.messages),
      config: {
        systemInstruction: call.system,
        maxOutputTokens: call.maxTokens + THINKING_HEADROOM,
        tools: [
          {
            functionDeclarations: call.tools.map((t) => ({
              name: t.name,
              description: t.description,
              parametersJsonSchema: t.inputSchema,
            })),
          },
        ],
        thinkingConfig: { thinkingLevel: thinkingLevel() },
      },
    });
    if (res.promptFeedback?.blockReason) throw new AiRefusalError(`Prompt blocked: ${res.promptFeedback.blockReason}`);
    const raw = res.candidates?.[0]?.content;
    const content: AiBlock[] = [];
    let n = 0;
    for (const part of raw?.parts ?? []) {
      if (part.thought) continue;
      if (part.functionCall?.name) {
        const id = part.functionCall.id || `${LOCAL_ID_PREFIX}${n++}`;
        const input = part.functionCall.args && typeof part.functionCall.args === 'object' ? part.functionCall.args : {};
        content.push({ type: 'tool_use', id, name: part.functionCall.name, input });
      } else if (typeof part.text === 'string' && part.text) {
        content.push({ type: 'text', text: part.text });
      }
    }
    const hasToolUse = content.some((b) => b.type === 'tool_use');
    // Keep the raw model content (thought signatures) for the next step of this tool loop only.
    if (raw) content.push({ type: 'provider_opaque', provider: 'gemini', raw: { role: 'model', parts: raw.parts ?? [] } });
    return { content, stopReason: mapStop(res, hasToolUse) };
  }
}
