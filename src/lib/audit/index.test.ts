import { describe, it, expect } from "vitest";
import { InMemoryAuditSink, withAudit, type AiAuditMeta } from "./index";

const meta: AiAuditMeta = {
  agencyId: "ag1",
  clientId: "cl1",
  action: "copy_generation",
  provider: "anthropic",
  model: "claude-opus-4-8",
  inputSummary: "caption for linkedin post",
};

// Deterministic clock that advances 250ms per read.
function steppingClock(stepMs = 250) {
  let t = 1_000;
  return () => {
    const d = new Date(t);
    t += stepMs;
    return d;
  };
}

describe("withAudit", () => {
  it("records a success and returns the result", async () => {
    const sink = new InMemoryAuditSink();
    const result = await withAudit(
      sink,
      meta,
      async () => ({ result: "caption text", outputSummary: "32 chars", completionTokens: 8 }),
      steppingClock(),
    );
    expect(result).toBe("caption text");
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      action: "copy_generation",
      status: "success",
      completionTokens: 8,
      latencyMs: 250,
    });
  });

  it("records an error and rethrows", async () => {
    const sink = new InMemoryAuditSink();
    await expect(
      withAudit(sink, meta, async () => {
        throw new Error("model timeout");
      }),
    ).rejects.toThrow("model timeout");
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0].status).toBe("error");
    expect(sink.records[0].error).toBe("model timeout");
  });
});
