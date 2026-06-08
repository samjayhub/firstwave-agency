// Anthropic-backed LlmProvider. The only place the Anthropic SDK is used; all
// callers depend on the LlmProvider interface so the model is swappable.
import Anthropic from "@anthropic-ai/sdk";
import type { LlmProvider, LlmMessage, LlmCompleteOptions } from "./types";

// Default to a cost-effective Claude model; callers can override per provider.
export const DEFAULT_LLM_MODEL = "claude-sonnet-4-6";

export class AnthropicLlmProvider implements LlmProvider {
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = DEFAULT_LLM_MODEL,
  ) {
    this.client = new Anthropic({ apiKey });
  }

  async complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<string> {
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: opts?.maxTokens ?? 1024,
      ...(opts?.system ? { system: opts.system } : {}),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
    return res.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");
  }
}
