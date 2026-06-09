import { describe, it, expect } from "vitest";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { InMemoryAssetStorage, LocalAssetStorage } from "./asset-storage";

describe("InMemoryAssetStorage", () => {
  it("stores bytes and returns a memory url", async () => {
    const store = new InMemoryAssetStorage();
    const out = await store.put("a/b.png", Buffer.from("hi"), "image/png");
    expect(out.url).toBe("memory://a/b.png");
    expect(store.objects.get("a/b.png")?.bytes.toString()).toBe("hi");
  });

  it("deletes by url, and ignores urls it does not own", async () => {
    const store = new InMemoryAssetStorage();
    await store.put("a/b.png", Buffer.from("hi"), "image/png");
    await store.deleteByUrl("https://cdn.example.com/external.png"); // not ours → no-op
    expect(store.objects.size).toBe(1);
    await store.deleteByUrl("memory://a/b.png");
    expect(store.objects.has("a/b.png")).toBe(false);
  });
});

describe("LocalAssetStorage", () => {
  it("writes the file under the base dir and returns a prefixed url", async () => {
    const base = join(tmpdir(), `sml-assets-test-${process.pid}`);
    try {
      const store = new LocalAssetStorage(base, "/assets");
      const bytes = Buffer.from("PNGDATA");
      const out = await store.put("client1/item1/x.png", bytes, "image/png");
      expect(out.url).toBe("/assets/client1/item1/x.png");
      const written = await readFile(join(base, "client1/item1/x.png"));
      expect(written.toString()).toBe("PNGDATA");

      const got = await store.get("client1/item1/x.png");
      expect(got?.bytes.toString()).toBe("PNGDATA");
      expect(got?.contentType).toBe("image/png");
      expect(await store.get("client1/item1/missing.png")).toBeNull();

      // deleteByUrl removes the file; a second delete (already gone) is a no-op.
      await store.deleteByUrl("/assets/client1/item1/x.png");
      expect(await store.get("client1/item1/x.png")).toBeNull();
      await store.deleteByUrl("/assets/client1/item1/x.png");
      await store.deleteByUrl("https://external.example/y.png"); // not ours → no-op
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
