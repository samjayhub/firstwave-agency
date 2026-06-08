// LLM provider interface (Anthropic SDK by default). Used by Research,
// Planner, Copy, and Brand-voice analysis. Phase 0: types only.

export interface LlmMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LlmCompleteOptions {
  system?: string;
  maxTokens?: number;
  /** When set, the provider must return JSON matching this shape (tool/JSON mode). */
  jsonSchema?: object;
}

export interface LlmProvider {
  complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<string>;
}
