import { describe, it, expect } from "vitest";
import { TrendService } from "./index";
import { FakeTrendStore, fakeTrendSource } from "./fakes/fake-trend-service";
import type { TrendFeed } from "./types";
import { FakeLlmProvider } from "@/lib/llm/fake";
import { InMemoryAuditSink } from "@/lib/audit";
import { ClientRepository } from "@/lib/repositories/client-repository";
import { FakeClientStore } from "@/lib/repositories/fakes/fake-client-store";
import { ExternalServiceError, ValidationError } from "@/lib/errors/app-error";

const BRIEF_JSON = JSON.stringify({
  angles: ["ride the spike with a hot take", "explainer on why it's trending"],
  formats: ["short reaction", "carousel breakdown"],
  recommendations: ["post within 24h", "batch three shorts"],
});

const FEEDS: Record<string, TrendFeed> = {
  youtube: {
    platform: "youtube",
    observations: [
      { topic: "AI fitness coach", volume: 1000, growth: 0.5 },
      { topic: "protein myths", volume: 500, growth: 2.0 },
      { topic: "old fad diet", volume: 200, growth: -0.5 },
    ],
  },
};

async function setup(opts: { niche?: string | null } = {}) {
  const clients = new ClientRepository(new FakeClientStore());
  const client = await clients.create(
    { agencyId: "ag1" },
    { name: "Acme", niche: opts.niche === undefined ? "fitness" : opts.niche },
  );
  const store = new FakeTrendStore();
  const sink = new InMemoryAuditSink();
  const llm = FakeLlmProvider.constant(BRIEF_JSON);
  const svc = new TrendService({
    llm,
    sink,
    model: "claude-sonnet-4-6",
    store,
    clients,
    source: fakeTrendSource(FEEDS),
    clock: () => new Date("2026-06-09T00:00:00Z"),
  });
  return { svc, client, store, sink, llm };
}

describe("TrendService.analyze", () => {
  it("ranks trends, synthesises a brief, persists, audits once", async () => {
    const { svc, client, store, sink } = await setup();

    const brief = await svc.analyze(
      { agencyId: "ag1" },
      { clientId: client.id, platform: "youtube" },
    );

    expect(brief.niche).toBe("fitness");
    expect(brief.platform).toBe("youtube");
    // Highest score first (size + momentum blend).
    expect(brief.trends.map((t) => t.topic)).toEqual([
      "AI fitness coach",
      "protein myths",
      "old fad diet",
    ]);
    expect(brief.angles).toHaveLength(2);
    expect(brief.recommendations).toHaveLength(2);
    expect(brief.capturedAt).toBe("2026-06-09T00:00:00.000Z");

    const stored = await store.getBrief("ag1", client.id);
    expect(stored).toEqual(brief);
    expect(store.saved.get(`ag1:${client.id}`)).toHaveLength(3);

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]!.action).toBe("trend_analysis");
    expect(sink.records[0]!.status).toBe("success");
  });

  it("feeds the niche, platform and ranked topics into the LLM prompt", async () => {
    const { svc, client, llm } = await setup();
    await svc.analyze({ agencyId: "ag1" }, { clientId: client.id });
    const prompt = llm.calls[0]!.messages[0]!.content;
    expect(prompt).toContain("Niche: fitness");
    expect(prompt).toContain("Platform: youtube");
    expect(prompt).toContain("AI fitness coach");
    expect(prompt).toContain("score=");
  });

  it("defaults the platform to youtube", async () => {
    const { svc, client } = await setup();
    const brief = await svc.analyze({ agencyId: "ag1" }, { clientId: client.id });
    expect(brief.platform).toBe("youtube");
  });

  it("throws ValidationError when client has no niche", async () => {
    const { svc, client } = await setup({ niche: null });
    await expect(
      svc.analyze({ agencyId: "ag1" }, { clientId: client.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ExternalServiceError when the source returns no observations", async () => {
    const { svc, client } = await setup();
    await expect(
      svc.analyze({ agencyId: "ag1" }, { clientId: client.id, platform: "tiktok" }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it("throws NotFoundError for wrong agency", async () => {
    const { svc, client } = await setup();
    await expect(
      svc.analyze({ agencyId: "wrong-agency" }, { clientId: client.id }),
    ).rejects.toThrow();
  });
});

describe("TrendService.getBrief", () => {
  it("returns null when no brief exists", async () => {
    const { svc, client } = await setup();
    expect(await svc.getBrief({ agencyId: "ag1" }, client.id)).toBeNull();
  });

  it("returns the stored brief after analyze", async () => {
    const { svc, client } = await setup();
    const original = await svc.analyze({ agencyId: "ag1" }, { clientId: client.id });
    expect(await svc.getBrief({ agencyId: "ag1" }, client.id)).toEqual(original);
  });
});
