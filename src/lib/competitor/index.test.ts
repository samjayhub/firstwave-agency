import { describe, it, expect } from "vitest";
import { CompetitorService } from "./index";
import {
  FakeCompetitorStore,
  fakeCompetitorSource,
} from "./fakes/fake-competitor-service";
import type { CompetitorChannel } from "./types";
import { FakeLlmProvider } from "@/lib/llm/fake";
import { InMemoryAuditSink } from "@/lib/audit";
import { ClientRepository } from "@/lib/repositories/client-repository";
import { FakeClientStore } from "@/lib/repositories/fakes/fake-client-store";
import { ValidationError } from "@/lib/errors/app-error";

const BRIEF_JSON = JSON.stringify({
  hooks: ["contrarian take", "before/after reveal"],
  formats: ["short tutorial", "listicle"],
  rhythm: "Post 4 shorts a week to match the leader's cadence.",
  recommendations: ["lead with the payoff", "batch-film tutorials"],
});

// Channel A: high engagement, mostly shorts. Channel B: lower engagement, long.
const CHANNELS: Record<string, CompetitorChannel> = {
  "https://youtube.com/@alpha": {
    handle: "alpha",
    url: "https://youtube.com/@alpha",
    platform: "youtube",
    posts: [
      { title: "Hook A1", views: 1000, likes: 200, comments: 50, publishedAt: "2026-06-01T00:00:00Z", durationSec: 45 },
      { title: "Hook A2", views: 2000, likes: 400, comments: 100, publishedAt: "2026-06-08T00:00:00Z", durationSec: 30 },
    ],
  },
  "https://youtube.com/@beta": {
    handle: "beta",
    url: "https://youtube.com/@beta",
    platform: "youtube",
    posts: [
      { title: "Hook B1", views: 5000, likes: 100, comments: 20, publishedAt: "2026-06-01T00:00:00Z", durationSec: 600 },
    ],
  },
};

async function setup(opts: { niche?: string | null } = {}) {
  const clientStore = new FakeClientStore();
  const clients = new ClientRepository(clientStore);
  const client = await clients.create(
    { agencyId: "ag1" },
    { name: "Acme", niche: opts.niche === undefined ? "fitness" : opts.niche },
  );
  const store = new FakeCompetitorStore();
  const sink = new InMemoryAuditSink();
  const llm = FakeLlmProvider.constant(BRIEF_JSON);
  const svc = new CompetitorService({
    llm,
    sink,
    model: "claude-sonnet-4-6",
    store,
    clients,
    source: fakeCompetitorSource(CHANNELS),
    clock: () => new Date("2026-06-08T00:00:00Z"),
  });
  return { svc, client, store, sink, llm };
}

describe("CompetitorService.analyze", () => {
  it("ranks competitors by engagement, synthesises a brief, persists, audits once", async () => {
    const { svc, client, store, sink } = await setup();

    const brief = await svc.analyze(
      { agencyId: "ag1" },
      {
        clientId: client.id,
        competitors: [
          { url: "https://youtube.com/@beta" },
          { url: "https://youtube.com/@alpha" },
        ],
      },
    );

    expect(brief.niche).toBe("fitness");
    // alpha has far higher engagement than beta, so it ranks first.
    expect(brief.competitors.map((c) => c.handle)).toEqual(["alpha", "beta"]);
    expect(brief.competitors[0]!.topFormats).toEqual(["short"]);
    expect(brief.hooks).toHaveLength(2);
    expect(brief.recommendations).toHaveLength(2);
    expect(brief.capturedAt).toBe("2026-06-08T00:00:00.000Z");

    const stored = await store.getBrief("ag1", client.id);
    expect(stored).toEqual(brief);
    expect(store.saved.get(`ag1:${client.id}`)).toHaveLength(2);

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]!.action).toBe("competitor_analysis");
    expect(sink.records[0]!.status).toBe("success");
  });

  it("feeds sample titles and metrics into the LLM prompt", async () => {
    const { svc, client, llm } = await setup();
    await svc.analyze(
      { agencyId: "ag1" },
      { clientId: client.id, competitors: [{ url: "https://youtube.com/@alpha" }] },
    );
    const prompt = llm.calls[0]!.messages[0]!.content;
    expect(prompt).toContain("Niche: fitness");
    expect(prompt).toContain("@alpha");
    expect(prompt).toContain("Hook A1");
    expect(prompt).toContain("engagementRate=");
  });

  it("caps competitors at 5", async () => {
    const { svc, client, store } = await setup();
    const competitors = Array.from({ length: 8 }, (_, i) => ({
      url: `https://youtube.com/@c${i}`,
    }));
    await svc.analyze({ agencyId: "ag1" }, { clientId: client.id, competitors });
    expect(store.saved.get(`ag1:${client.id}`)).toHaveLength(5);
  });

  it("throws ValidationError when client has no niche", async () => {
    const { svc, client } = await setup({ niche: null });
    await expect(
      svc.analyze(
        { agencyId: "ag1" },
        { clientId: client.id, competitors: [{ url: "https://youtube.com/@alpha" }] },
      ),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws ValidationError when no competitors are provided", async () => {
    const { svc, client } = await setup();
    await expect(
      svc.analyze({ agencyId: "ag1" }, { clientId: client.id, competitors: [] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError for wrong agency", async () => {
    const { svc, client } = await setup();
    await expect(
      svc.analyze(
        { agencyId: "wrong-agency" },
        { clientId: client.id, competitors: [{ url: "https://youtube.com/@alpha" }] },
      ),
    ).rejects.toThrow();
  });
});

describe("CompetitorService.getBrief", () => {
  it("returns null when no brief exists", async () => {
    const { svc, client } = await setup();
    expect(await svc.getBrief({ agencyId: "ag1" }, client.id)).toBeNull();
  });

  it("returns the stored brief after analyze", async () => {
    const { svc, client } = await setup();
    const original = await svc.analyze(
      { agencyId: "ag1" },
      { clientId: client.id, competitors: [{ url: "https://youtube.com/@alpha" }] },
    );
    expect(await svc.getBrief({ agencyId: "ag1" }, client.id)).toEqual(original);
  });
});
