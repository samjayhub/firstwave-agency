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
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});
