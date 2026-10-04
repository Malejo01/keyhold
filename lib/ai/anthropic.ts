import Anthropic from '@anthropic-ai/sdk';
import type { AiBlock, AiMessage, AiProvider, ChatStepCall, ChatStepResult, StopReason, StructuredCall } from './types';

import { AiRefusalError } from './errors';

export { AiRefusalError };

function toParamBlocks(blocks: AiBlock[]): Anthropic.ContentBlockParam[] {
  return blocks.map((b): Anthropic.ContentBlockParam => {
    switch (b.type) {
      case 'text':
        return { type: 'text', text: b.text };
      case 'tool_use':
        return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
      case 'tool_result':
        return { type: 'tool_result', tool_use_id: b.toolUseId, content: b.content, is_error: b.isError };
      case 'provider_opaque':
        return b.raw as Anthropic.ContentBlockParam;
    }
  });
}

function toMessageParams(messages: AiMessage[]): Anthropic.MessageParam[] {
  return messages.map((m) => ({ role: m.role, content: toParamBlocks(m.content) }));
}

function fromResponse(content: Anthropic.ContentBlock[]): AiBlock[] {
  const out: AiBlock[] = [];
  for (const block of content) {
    if (block.type === 'text') out.push({ type: 'text', text: block.text });
    else if (block.type === 'tool_use') {
      const input = block.input && typeof block.input === 'object' ? (block.input as Record<string, unknown>) : {};
      out.push({ type: 'tool_use', id: block.id, name: block.name, input });
    } else out.push({ type: 'provider_opaque', provider: 'anthropic', raw: block });
  }
  return out;
}

function mapStop(reason: Anthropic.StopReason | null): StopReason {
  if (reason === 'end_turn' || reason === 'tool_use' || reason === 'max_tokens' || reason === 'refusal') return reason;
  return 'other';
}

/** Low effort keeps chat turns fast; Haiku 4.5 does not accept `effort`. */
function effortFor(model: string): Anthropic.OutputConfig | undefined {
  if (model.startsWith('claude-haiku')) return undefined;
  const effort = process.env.ANTHROPIC_EFFORT || 'low';
  if (effort === 'low' || effort === 'medium' || effort === 'high') return { effort };
  return undefined;
}

/** Files first (image/document blocks), then the instruction text that refers to them in order. */
function userContent(call: StructuredCall): string | Anthropic.ContentBlockParam[] {
  if (!call.attachments?.length) return call.user;
  const files = call.attachments.map((a): Anthropic.ContentBlockParam => {
    const data = Buffer.from(a.data).toString('base64');
    return a.mimeType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
      : { type: 'image', source: { type: 'base64', media_type: a.mimeType, data } };
  });
  return [...files, { type: 'text', text: call.user }];
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'anthropic';
  private client: Anthropic | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  }

  private sdk(): Anthropic {
    this.client ??= new Anthropic({ maxRetries: 0, timeout: 60_000 }) // lib/ai/retry.ts handles 429/5xx;
    return this.client;
  }

  async generateJson(call: StructuredCall): Promise<unknown> {
    const res = await this.sdk().messages.create({
      model: call.model,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: [{ role: 'user', content: userContent(call) }],
      output_config: { ...effortFor(call.model), format: { type: 'json_schema', schema: call.jsonSchema } },
    });
    if (res.stop_reason === 'refusal') throw new AiRefusalError();
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    return JSON.parse(text) as unknown;
  }

  async chatStep(call: ChatStepCall): Promise<ChatStepResult> {
    const effort = effortFor(call.model);
    const res = await this.sdk().messages.create({
      model: call.model,
      max_tokens: call.maxTokens,
      system: call.system,
      messages: toMessageParams(call.messages),
      tools: call.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
      tool_choice: { type: 'auto' },
      ...(effort ? { output_config: effort } : {}),
    });
    return { content: fromResponse(res.content), stopReason: mapStop(res.stop_reason) };
  }
}
