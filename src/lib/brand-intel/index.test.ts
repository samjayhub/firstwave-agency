import { describe, it, expect } from "vitest";
import { BrandIntelligenceService } from "./index";
import { FakeCrawler, FakeBrandProfileStore } from "./fakes/fake-brand-intel";
import { FakeLlmProvider } from "@/lib/llm/fake";
import { InMemoryAuditSink } from "@/lib/audit";
import { ClientRepository } from "@/lib/repositories/client-repository";
import { FakeClientStore } from "@/lib/repositories/fakes/fake-client-store";

const VOICE = JSON.stringify({
  tone: ["bold"],
  themes: ["x"],
  audience: "founders",
  dos: [],
  donts: [],
});

const PAGE = {
  url: "https://acme.com",
  title: "Acme",
  text: "We make bold things for founders.",
  css: "body{background:#ffffff;color:#111111}.b{color:#2563eb}.b{color:#2563eb}",
  images: [{ src: "/logo.svg", alt: "Acme logo", inHeader: true }],
};

async function setup() {
  const clients = new ClientRepository(new FakeClientStore());
  const client = await clients.create(
    { agencyId: "ag1" },
    { name: "Acme", websiteUrl: "https://acme.com" },
  );
  const profiles = new FakeBrandProfileStore();
  const sink = new InMemoryAuditSink();
  const svc = new BrandIntelligenceService({
    crawler: new FakeCrawler(PAGE),
    llm: FakeLlmProvider.constant(VOICE),
    sink,
    model: "claude-sonnet-4-6",
    clients,
    profiles,
  });
  return { svc, client, profiles, sink };
}

describe("BrandIntelligenceService.extract", () => {
  it("extracts palette/fonts/logo/voice, persists, and audits once", async () => {
    const { svc, client, profiles, sink } = await setup();
    const data = await svc.extract(
      { agencyId: "ag1" },
      { clientId: client.id, websiteUrl: "https://acme.com" },
    );

    expect(data.palette.find((p) => p.role === "background")?.hex).toBe("#ffffff");
    expect(data.logoUrl).toBe("/logo.svg");
    expect(data.voice.tone).toContain("bold");
    expect(await profiles.findByClient(client.id)).not.toBeNull();
    expect(sink.records).toHaveLength(1);
    expect(sink.records[0]!.action).toBe("brand_voice_analysis");
  });

  it("refuses to extract for a client in another agency", async () => {
    const { svc, client } = await setup();
    await expect(
      svc.extract({ agencyId: "intruder" }, { clientId: client.id, websiteUrl: "https://acme.com" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects a non-absolute websiteUrl", async () => {
    const { svc, client } = await setup();
    await expect(
      svc.extract({ agencyId: "ag1" }, { clientId: client.id, websiteUrl: "acme.com" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
