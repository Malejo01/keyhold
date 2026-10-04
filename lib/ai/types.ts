/**
 * Provider-neutral AI types. Agents only see these; a Gemini provider can implement AiProvider
 * without touching any agent.
 */

export type ModelRole = 'orchestration' | 'extraction';

export type AiBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError?: boolean }
  /** Provider-specific block (e.g. a thinking block) passed back unchanged within one tool loop. */
  | { type: 'provider_opaque'; provider: string; raw: unknown };

export interface AiMessage {
  role: 'user' | 'assistant';
  content: AiBlock[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the tool input. */
  inputSchema: Record<string, unknown>;
}

/** A binary file (image or PDF) sent inline with a structured call. Never persisted; lives in memory for the request. */
export interface AiAttachment {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';
  /** Raw bytes. Providers base64-encode them. */
  data: Uint8Array;
  /** sha256 hex of `data`; identifies the file in replay keys. */
  sha256: string;
}

export interface StructuredCall {
  model: string;
  system: string;
  user: string;
  /** Files the model should read together with `user`. Untrusted content: the prompt must say so. */
  attachments?: AiAttachment[];
  /** JSON Schema the response must follow. */
  jsonSchema: Record<string, unknown>;
  maxTokens: number;
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'other';

export interface ChatStepCall {
  model: string;
  system: string;
  messages: AiMessage[];
  tools: ToolDefinition[];
  maxTokens: number;
}

export interface ChatStepResult {
  content: AiBlock[];
  stopReason: StopReason;
}

export interface AiProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Returns the parsed JSON object; the caller validates it with zod. */
  generateJson(call: StructuredCall): Promise<unknown>;
  /** One model step of a tool loop. The caller runs the tools and loops. */
  chatStep(call: ChatStepCall): Promise<ChatStepResult>;
}

/** Where a response came from. 'replay' = served from evals/recordings. */
export type AiSource = 'live' | 'replay';

export interface Recording {
  key: string;
  agent: string;
  kind: 'structured' | 'chat_step';
  /** Free label for humans, e.g. the tenant id. */
  label?: string;
  /** Provider that produced it ('gemini', 'anthropic', 'hand-authored'). Not part of the replay key. */
  provider?: string;
  model: string;
  /** 'recorded' = real model response; 'hand-authored' = written by hand in the exact shape of one. */
  source: 'recorded' | 'hand-authored';
  recordedAt: string;
  output: unknown;
}
