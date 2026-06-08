import { describe, it, expect } from "vitest";
import { parseEnv, requireEnv } from "./env";

describe("parseEnv", () => {
  it("applies safe defaults when nothing is set", () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_BASE_URL).toBe("http://localhost:3000");
    expect(env.IMAGE_GEN_PROVIDER).toBe("fake");
    expect(env.ASSET_STORAGE_DIR).toBe("./.assets");
  });

  it("rejects an invalid NODE_ENV", () => {
    expect(() => parseEnv({ NODE_ENV: "staging" })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it("rejects a malformed APP_BASE_URL", () => {
    expect(() => parseEnv({ APP_BASE_URL: "not-a-url" })).toThrow(
      /Invalid environment configuration/,
    );
  });

  it("rejects a too-short JWT_SECRET", () => {
    expect(() => parseEnv({ JWT_SECRET: "short" })).toThrow();
  });
});

describe("requireEnv", () => {
  it("returns the value when present", () => {
    const env = parseEnv({ DATABASE_URL: "postgres://localhost/db" });
    expect(requireEnv("DATABASE_URL", env)).toBe("postgres://localhost/db");
  });

  it("throws a clear error when the value is missing", () => {
    const env = parseEnv({});
    expect(() => requireEnv("JWT_SECRET", env)).toThrow(
      /Missing required environment variable: JWT_SECRET/,
    );
  });
});
