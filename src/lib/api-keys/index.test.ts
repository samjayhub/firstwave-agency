import { describe, expect, it } from "vitest";
import { ApiKeyService, sha256Hex } from "./index";
import { FakeApiKeyStore } from "./fakes";

const CTX = { agencyId: "ag1" };

function setup() {
  const store = new FakeApiKeyStore();
  let n = 0;
  const service = new ApiKeyService({ store, randomHex: (bytes) => `${bytes}${++n}` });
  return { store, service };
}

describe("ApiKeyService", () => {
  it("mints a token shown once and stores only its hash", async () => {
    const { store, service } = setup();
    const key = await service.mint(CTX, "CI");
    expect(key.token.startsWith("fw_")).toBe(true);
    expect(key.name).toBe("CI");
    // The raw token is not in the persisted row; the hash matches it.
    expect(JSON.stringify(store.rows)).not.toContain(key.token);
    const match = await store.findByHash(sha256Hex(key.token));
    expect(match?.agencyId).toBe("ag1");
  });

  it("authenticates a valid token to its agency and touches lastUsedAt", async () => {
    const { store, service } = setup();
    const key = await service.mint(CTX, "CI");
    const ctx = await service.authenticate(key.token);
    expect(ctx).toEqual({ agencyId: "ag1" });
    expect(store.rows[0]!.lastUsedAt).not.toBeNull();
  });

  it("rejects malformed, unknown, and revoked tokens", async () => {
    const { service } = setup();
    expect(await service.authenticate(undefined)).toBeNull();
    expect(await service.authenticate("not-a-key")).toBeNull();
    const key = await service.mint(CTX, "CI");
    await service.revoke(CTX, (await service.list(CTX))[0]!.id);
    expect(await service.authenticate(key.token)).toBeNull();
  });

  it("revoke is tenant-scoped and 404s for the wrong agency", async () => {
    const { service } = setup();
    await service.mint(CTX, "CI");
    const id = (await service.list(CTX))[0]!.id;
    await expect(service.revoke({ agencyId: "other" }, id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("list never leaks the agencyId or secret", async () => {
    const { service } = setup();
    await service.mint(CTX, "CI");
    const list = await service.list(CTX);
    expect(list[0]).not.toHaveProperty("agencyId");
    expect(list[0]).not.toHaveProperty("token");
    expect(list[0]!.prefix).toBeTruthy();
  });
});
