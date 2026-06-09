// AssetStorage implementations. LocalAssetStorage writes to a directory for MVP;
// swap to an S3/R2-backed implementation later (same interface). InMemory is for
// tests. URLs point at the tenant-checked streamer route (/api/assets/...).
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { ValidationError } from "@/lib/errors/app-error";
import type { AssetStorage, StoredBytes, StoredObject } from "./types";

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
};

export function contentTypeForKey(key: string): string {
  return CONTENT_TYPES[extname(key).toLowerCase()] ?? "application/octet-stream";
}

export class LocalAssetStorage implements AssetStorage {
  constructor(
    private readonly baseDir: string,
    private readonly urlPrefix = "/api/assets",
  ) {}

  private safePath(key: string): string {
    const path = join(this.baseDir, key);
    // Defense-in-depth: never read/write outside the base dir.
    if (!resolve(path).startsWith(resolve(this.baseDir) + sep)) {
      throw new ValidationError("Invalid asset key");
    }
    return path;
  }

  async put(key: string, bytes: Buffer, _contentType: string): Promise<StoredObject> {
    const path = this.safePath(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return { key, url: `${this.urlPrefix}/${key}` };
  }

  async get(key: string): Promise<StoredBytes | null> {
    try {
      const bytes = await readFile(this.safePath(key));
      return { bytes, contentType: contentTypeForKey(key) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async deleteByUrl(url: string): Promise<void> {
    const prefix = `${this.urlPrefix}/`;
    if (!url.startsWith(prefix)) return; // not ours (e.g. an external upload)
    try {
      await unlink(this.safePath(url.slice(prefix.length)));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
  }
}

export class InMemoryAssetStorage implements AssetStorage {
  readonly objects = new Map<string, StoredBytes>();

  async put(key: string, bytes: Buffer, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { bytes, contentType });
    return { key, url: `memory://${key}` };
  }

  async get(key: string): Promise<StoredBytes | null> {
    return this.objects.get(key) ?? null;
  }

  async deleteByUrl(url: string): Promise<void> {
    const prefix = "memory://";
    if (!url.startsWith(prefix)) return;
    this.objects.delete(url.slice(prefix.length));
  }
}
