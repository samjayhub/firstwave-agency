import { describe, expect, it, beforeEach } from "vitest";
import { ReportService } from "./index";
import { FakeReportStore, recordingSender } from "./fakes";
import { ClientRepository } from "@/lib/repositories/client-repository";
import { FakeClientStore } from "@/lib/repositories/fakes/fake-client-store";
import { FakeBrandingStore } from "@/lib/repositories/fakes/fake-branding-store";

const NOW = new Date("2026-06-09T00:00:00Z");
const CTX = { agencyId: "ag1" };

async function setup() {
  const clients = new ClientRepository(new FakeClientStore());
  const client = await clients.create(CTX, { name: "Acme" });
  const branding = new FakeBrandingStore();
  const store = new FakeReportStore({
    [client.id]: [
      { platform: "linkedin", metrics: { impressions: 100, likes: 5 }, idea: "Hi", capturedAt: NOW },
    ],
  });
  const sender = recordingSender();
  const service = new ReportService({ store, branding, clients, sendEmail: sender, clock: () => NOW });
  return { service, client, branding, store, sender, clients };
}

describe("ReportService.build", () => {
  it("builds a report for an owned client", async () => {
    const { service, client } = await setup();
    const report = await service.build(CTX, client.id);
    expect(report.clientName).toBe("Acme");
    expect(report.totals.impressions).toBe(100);
  });

  it("refuses a client in another agency", async () => {
    const { service, client } = await setup();
    await expect(service.build({ agencyId: "intruder" }, client.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("ReportService.send", () => {
  it("uses the explicit recipient", async () => {
    const { service, client, sender } = await setup();
    const res = await service.send(CTX, client.id, { to: "boss@acme.com" });
    expect(res.to).toBe("boss@acme.com");
    expect(sender.sent[0]!.to).toBe("boss@acme.com");
    expect(sender.sent[0]!.html).toContain("Acme");
  });

  it("falls back to branding.supportEmail", async () => {
    const { service, client, branding } = await setup();
    await branding.upsertByAgency("ag1", { supportEmail: "ops@acme.com" });
    const res = await service.send(CTX, client.id);
    expect(res.to).toBe("ops@acme.com");
  });

  it("throws when no recipient can be resolved", async () => {
    const { service, client } = await setup();
    await expect(service.send(CTX, client.id)).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("ReportService.runDigest", () => {
  let svc: ReportService;
  let sender: ReturnType<typeof recordingSender>;

  beforeEach(async () => {
    const clients = new ClientRepository(new FakeClientStore());
    const branding = new FakeBrandingStore();
    sender = recordingSender();
    const store = new FakeReportStore(
      { c1: [], c2: [] },
      [
        { agencyId: "ag1", clientId: "c1", clientName: "One", recipient: "a@x.com" },
        { agencyId: "ag1", clientId: "c2", clientName: "Two", recipient: "b@x.com" },
      ],
    );
    svc = new ReportService({ store, branding, clients, sendEmail: sender, clock: () => NOW });
  });

  it("emails one report per digest target (no client lookup needed)", async () => {
    const res = await svc.runDigest();
    expect(res.sent).toBe(2);
    expect(sender.sent.map((m) => m.to).sort()).toEqual(["a@x.com", "b@x.com"]);
  });

  it("isolates a per-target failure from the rest of the batch", async () => {
    let n = 0;
    const failing = (async (msg: { to: string; subject: string; html: string }) => {
      n += 1;
      if (n === 1) throw new Error("smtp down");
      sender.sent.push(msg);
    }) as typeof sender;
    failing.sent = sender.sent;
    const clients = new ClientRepository(new FakeClientStore());
    const store = new FakeReportStore(
      { c1: [], c2: [] },
      [
        { agencyId: "ag1", clientId: "c1", clientName: "One", recipient: "a@x.com" },
        { agencyId: "ag1", clientId: "c2", clientName: "Two", recipient: "b@x.com" },
      ],
    );
    const svc2 = new ReportService({
      store,
      branding: new FakeBrandingStore(),
      clients,
      sendEmail: failing,
      clock: () => NOW,
    });
    const res = await svc2.runDigest();
    expect(res.sent).toBe(1); // one failed, one succeeded
  });
});
