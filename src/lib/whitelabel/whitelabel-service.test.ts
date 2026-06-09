import { describe, it, expect, beforeEach } from "vitest";
import { WhiteLabelService } from "./index";
import { FakeBrandingStore } from "@/lib/repositories/fakes/fake-branding-store";

const AGENCY_A = { agencyId: "agency_A" };
const AGENCY_B = { agencyId: "agency_B" };

describe("WhiteLabelService", () => {
  let store: FakeBrandingStore;
  let svc: WhiteLabelService;

  beforeEach(() => {
    store = new FakeBrandingStore();
    svc = new WhiteLabelService({ store });
  });

  it("returns all-null defaults when no branding row exists", async () => {
    expect(await svc.getSettings(AGENCY_A)).toEqual({
      agencyId: "agency_A",
      brandName: null,
      logoUrl: null,
      primaryColor: null,
      supportEmail: null,
      customDomain: null,
    });
  });

  it("creates then patches branding (partial update leaves other fields)", async () => {
    await svc.updateSettings(AGENCY_A, { brandName: "Acme", primaryColor: "#4F46E5" });
    let rec = await svc.getSettings(AGENCY_A);
    expect(rec.brandName).toBe("Acme");
    expect(rec.primaryColor).toBe("#4F46E5");

    await svc.updateSettings(AGENCY_A, { logoUrl: "https://cdn/logo.png" });
    rec = await svc.getSettings(AGENCY_A);
    expect(rec.brandName).toBe("Acme"); // untouched
    expect(rec.logoUrl).toBe("https://cdn/logo.png");
  });

  it("clears a field when patched with null", async () => {
    await svc.updateSettings(AGENCY_A, { brandName: "Acme" });
    await svc.updateSettings(AGENCY_A, { brandName: null });
    expect((await svc.getSettings(AGENCY_A)).brandName).toBeNull();
  });

  it("isolates tenants — A's branding is invisible to B", async () => {
    await svc.updateSettings(AGENCY_A, { brandName: "Acme" });
    expect((await svc.getSettings(AGENCY_B)).brandName).toBeNull();
  });

  it("resolvePublic returns only display-safe fields", async () => {
    await svc.updateSettings(AGENCY_A, {
      brandName: "Acme",
      logoUrl: "https://cdn/logo.png",
      primaryColor: "#000000",
      supportEmail: "help@acme.com",
      customDomain: "brand.acme.com",
    });
    const pub = await svc.resolvePublic("agency_A");
    expect(pub).toEqual({
      brandName: "Acme",
      logoUrl: "https://cdn/logo.png",
      primaryColor: "#000000",
    });
    expect(pub).not.toHaveProperty("supportEmail");
    expect(pub).not.toHaveProperty("customDomain");
  });

  it("resolvePublicByDomain finds the agency by its custom domain", async () => {
    await svc.updateSettings(AGENCY_A, { brandName: "Acme", customDomain: "brand.acme.com" });
    const pub = await svc.resolvePublicByDomain("brand.acme.com");
    expect(pub.brandName).toBe("Acme");
    const miss = await svc.resolvePublicByDomain("unknown.example");
    expect(miss.brandName).toBeNull();
  });
});
