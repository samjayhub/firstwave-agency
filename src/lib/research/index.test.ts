import { describe, it, expect } from "vitest";
import { ResearchService } from "./index";
import { FakeResearchBriefStore } from "./fakes/fake-research-service";
import { FakeLlmProvider } from "@/lib/llm/fake";
import { InMemoryAuditSink } from "@/lib/audit";
import { ClientRepository } from "@/lib/repositories/client-repository";
import { FakeClientStore } from "@/lib/repositories/fakes/fake-client-store";
import { ValidationError } from "@/lib/errors/app-error";

const BRIEF_JSON = JSON.stringify({
  angles: ["beginner-friendly tutorials", "behind-the-scenes process"],
  painPoints: ["too expensive", "hard to learn"],
  pillars: ["education", "inspiration", "community"],
});

async function setup(opts: { niche?: string | null } = {}) {
  const clientStore = new FakeClientStore();
  const clients = new ClientRepository(clientStore);
  const client = await clients.create(
    { agencyId: "ag1" },
    { name: "Acme", niche: opts.niche === undefined ? "digital art" : opts.niche },
  );
  const store = new FakeResearchBriefStore();
  const sink = new InMemoryAuditSink();
  const svc = new ResearchService({
    llm: FakeLlmProvider.constant(BRIEF_JSON),
    sink,
    model: "claude-sonnet-4-6",
    store,
    clients,
    fetchUrl: async () => "sample page content",
    clock: () => new Date("2026-06-08T00:00:00Z"),
  });
  return { svc, client, store, sink, clients };
}

describe("ResearchService.synthesize", () => {
  it("synthesises a brief, persists it, and audits once", async () => {
    const { svc, client, store, sink } = await setup();

    const brief = await svc.synthesize({ agencyId: "ag1" }, { clientId: client.id });

    expect(brief.niche).toBe("digital art");
    expect(brief.angles).toHaveLength(2);
    expect(brief.painPoints).toHaveLength(2);
    expect(brief.pillars).toHaveLength(3);
    expect(brief.capturedAt).toBe("2026-06-08T00:00:00.000Z");

    const stored = await store.getBrief("ag1", client.id);
    expect(stored).toEqual(brief);

    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]!.action).toBe("research_brief");
    expect(sink.records[0]!.status).toBe("success");
  });

  it("fetches seed URLs and includes them in the prompt", async () => {
    const fetched: string[] = [];
    const clientStore = new FakeClientStore();
    const clients = new ClientRepository(clientStore);
    const client = await clients.create({ agencyId: "ag1" }, { name: "Acme", niche: "yoga" });
    const svc = new ResearchService({
      llm: FakeLlmProvider.constant(BRIEF_JSON),
      sink: new InMemoryAuditSink(),
      model: "claude-sonnet-4-6",
      store: new FakeResearchBriefStore(),
      clients,
      fetchUrl: async (url) => { fetched.push(url); return "yoga tips content"; },
    });

    await svc.synthesize({ agencyId: "ag1" }, {
      clientId: client.id,
      seedUrls: ["https://example.com/a", "https://example.com/b"],
    });

    expect(fetched).toEqual(["https://example.com/a", "https://example.com/b"]);
  });

  it("caps seed URLs at 3", async () => {
    const fetched: string[] = [];
    const clientStore = new FakeClientStore();
    const clients = new ClientRepository(clientStore);
    const client = await clients.create({ agencyId: "ag1" }, { name: "Acme", niche: "yoga" });
    const svc = new ResearchService({
      llm: FakeLlmProvider.constant(BRIEF_JSON),
      sink: new InMemoryAuditSink(),
      model: "claude-sonnet-4-6",
      store: new FakeResearchBriefStore(),
      clients,
      fetchUrl: async (url) => { fetched.push(url); return "content"; },
    });

    await svc.synthesize({ agencyId: "ag1" }, {
      clientId: client.id,
      seedUrls: ["https://a.com", "https://b.com", "https://c.com", "https://d.com"],
    });

    expect(fetched).toHaveLength(3);
  });

  it("throws ValidationError when client has no niche", async () => {
    const { svc, client } = await setup({ niche: null });
    await expect(
      svc.synthesize({ agencyId: "ag1" }, { clientId: client.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("throws NotFoundError for wrong agency", async () => {
    const { svc, client } = await setup();
    await expect(
      svc.synthesize({ agencyId: "wrong-agency" }, { clientId: client.id }),
    ).rejects.toThrow();
  });
});

describe("ResearchService.getBrief", () => {
  it("returns null when no brief exists", async () => {
    const { svc, client } = await setup();
    const brief = await svc.getBrief({ agencyId: "ag1" }, client.id);
    expect(brief).toBeNull();
  });

  it("returns stored brief after synthesize", async () => {
    const { svc, client } = await setup();
    const original = await svc.synthesize({ agencyId: "ag1" }, { clientId: client.id });
    const fetched = await svc.getBrief({ agencyId: "ag1" }, client.id);
    expect(fetched).toEqual(original);
  });
});
