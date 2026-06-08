// Typed, validated environment configuration. Single source of truth for every
// external dependency the app reads. Secrets are NEVER hardcoded — they are read
// from the environment and validated here. Optional secrets stay optional so the
// app can boot in dev/test without them; use `requireEnv` at the point of use to
// fail loudly when a feature actually needs one (no silent fail).
import { z } from "zod";

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  // Data + queue (needed from PR2/PR7 onward).
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // Auth (PR3).
  JWT_SECRET: z.string().min(16).optional(),
  // Used to encrypt OAuth tokens at rest (PR7). >=32 chars so a weak key fails
  // at boot rather than producing a weak cipher at runtime.
  TOKEN_ENCRYPTION_KEY: z.string().min(32).optional(),

  // AI providers (metered compute — the one unavoidable cost).
  ANTHROPIC_API_KEY: z.string().optional(),
  IMAGE_GEN_PROVIDER: z.enum(["imagen", "ideogram", "fake"]).default("fake"),
  IMAGE_GEN_API_KEY: z.string().optional(),
  // Competitor Intelligence — free YouTube Data API v3 key (P2-02).
  YOUTUBE_API_KEY: z.string().optional(),

  // LinkedIn — the MVP publishing platform (PR7).
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),
  LINKEDIN_REDIRECT_URI: z.string().url().optional(),

  // Generated-media storage. Local dir for MVP; swap to S3/R2 later.
  ASSET_STORAGE_DIR: z.string().default("./.assets"),
});

export type Env = z.infer<typeof envSchema>;

/** Parse + validate a raw environment object. Throws with a readable summary. */
export function parseEnv(
  source: Record<string, string | undefined> = process.env,
): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  return parsed.data;
}

let cached: Env | undefined;

/** Lazily parsed, cached view of `process.env`. */
export function getEnv(): Env {
  if (!cached) cached = parseEnv();
  return cached;
}

/** Test-only: drop the cached env so the next getEnv() re-parses. */
export function resetEnvCache(): void {
  cached = undefined;
}

/**
 * Return a required env value or throw. Use at the point a feature needs a secret
 * so missing config fails loudly instead of producing a confusing downstream error.
 * Intended for the genuinely-optional secrets (JWT_SECRET, OAuth, API keys) — for
 * fields with a zod `.default()` read `getEnv().X` directly (they are never empty).
 */
export function requireEnv<K extends keyof Env>(
  key: K,
  env: Env = getEnv(),
): NonNullable<Env[K]> {
  const value = env[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}

export const isProduction = (env: Env = getEnv()): boolean =>
  env.NODE_ENV === "production";
export const isTest = (env: Env = getEnv()): boolean => env.NODE_ENV === "test";
