// AssetStorage implementations. LocalAssetStorage writes to a directory for MVP;
// swap to an S3/R2-backed implementation later (same interface). InMemory is for
// tests.
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { AssetStorage, StoredObject } from "./types";

export class LocalAssetStorage implements AssetStorage {
  constructor(
    private readonly baseDir: string,
    private readonly urlPrefix = "/assets",
  ) {}

  async put(key: string, bytes: Buffer, _contentType: string): Promise<StoredObject> {
    const path = join(this.baseDir, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return { key, url: `${this.urlPrefix}/${key}` };
  }
}

export class InMemoryAssetStorage implements AssetStorage {
  readonly objects = new Map<string, { bytes: Buffer; contentType: string }>();

  async put(key: string, bytes: Buffer, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { bytes, contentType });
    return { key, url: `memory://${key}` };
  }
}
