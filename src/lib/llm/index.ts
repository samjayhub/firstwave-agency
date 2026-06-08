import { requireEnv } from "@/lib/config/env";
import { AnthropicLlmProvider } from "./anthropic";
import type { LlmProvider } from "./types";

export * from "./types";
export { AnthropicLlmProvider, DEFAULT_LLM_MODEL } from "./anthropic";
export { FakeLlmProvider } from "./fake";

/** Production LLM provider. Throws if ANTHROPIC_API_KEY is not configured. */
export function getLlmProvider(): LlmProvider {
  return new AnthropicLlmProvider(requireEnv("ANTHROPIC_API_KEY"));
}
