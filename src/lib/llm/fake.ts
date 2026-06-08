// Deterministic LlmProvider for tests. Supply a responder that returns the
// completion string for given messages/options.
import type { LlmProvider, LlmMessage, LlmCompleteOptions } from "./types";

export type LlmResponder = (
  messages: LlmMessage[],
  opts?: LlmCompleteOptions,
) => string | Promise<string>;

export class FakeLlmProvider implements LlmProvider {
  readonly calls: Array<{ messages: LlmMessage[]; opts?: LlmCompleteOptions }> = [];

  constructor(private readonly responder: LlmResponder) {}

  async complete(messages: LlmMessage[], opts?: LlmCompleteOptions): Promise<string> {
    this.calls.push({ messages, opts });
    return this.responder(messages, opts);
  }

  /** Convenience: always return the same string. */
  static constant(text: string): FakeLlmProvider {
    return new FakeLlmProvider(() => text);
  }
}
