import { describe, it, expect } from "vitest";
import { parseVoice, extractJsonObject, analyzeVoice } from "./voice";
import { FakeLlmProvider } from "@/lib/llm/fake";
import { InMemoryAuditSink } from "@/lib/audit";

const VALID = JSON.stringify({
  tone: ["confident", "warm"],
  themes: ["fitness", "habit-building"],
  audience: "busy professionals who want to get fit",
  dos: ["be encouraging"],
  donts: ["shame the reader"],
});

describe("extractJsonObject", () => {
  it("pulls JSON out of a fenced / chatty response", () => {
    const raw = "Here you go:\n```json\n" + VALID + "\n```";
    expect(extractJsonObject(raw)).toMatchObject({ audience: expect.any(String) });
  });
  it("prefers a fenced block even when prose has stray braces", () => {
    const raw = "Use the {placeholder} token. Result:\n```json\n" + VALID + "\n```\nHope that helps {thanks}";
    expect(extractJsonObject(raw)).toMatchObject({ audience: expect.any(String) });
  });

  it("throws on responses with no JSON", () => {
    expect(() => extractJsonObject("no json here")).toThrow();
  });
});

describe("parseVoice", () => {
  it("validates and returns a BrandVoice", () => {
    const voice = parseVoice(VALID);
    expect(voice.tone).toContain("confident");
  });
  it("rejects output missing required fields", () => {
    expect(() => parseVoice(JSON.stringify({ tone: [] }))).toThrow();
  });
});

describe("analyzeVoice", () => {
  it("returns the parsed voice and writes exactly one audit record", async () => {
    const llm = FakeLlmProvider.constant(VALID);
    const sink = new InMemoryAuditSink();
    const voice = await analyzeVoice(
      { llm, sink, model: "claude-sonnet-4-6" },
      { agencyId: "ag1", clientId: "cl1" },
      "We help busy people build fitness habits.",
    );
    expect(voice.audience).toMatch(/busy professionals/);
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]).toMatchObject({
      action: "brand_voice_analysis",
      status: "success",
      agencyId: "ag1",
      clientId: "cl1",
    });
  });

  it("audits a failure when the model returns garbage", async () => {
    const llm = FakeLlmProvider.constant("not json");
    const sink = new InMemoryAuditSink();
    await expect(
      analyzeVoice({ llm, sink, model: "m" }, { agencyId: "ag1", clientId: "cl1" }, "x"),
    ).rejects.toThrow();
    expect(sink.records[0]!.status).toBe("error");
  });
});
