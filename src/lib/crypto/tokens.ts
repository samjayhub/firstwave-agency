// Authenticated encryption for OAuth tokens at rest (AES-256-GCM). Stored format
// is `iv.tag.ciphertext` (all base64). The key is derived from TOKEN_ENCRYPTION_KEY
// via SHA-256 so any sufficiently-long secret yields a 32-byte key. Tokens are
// NEVER stored or logged in plaintext.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { requireEnv } from "@/lib/config/env";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export function encryptToken(
  plaintext: string,
  secret: string = requireEnv("TOKEN_ENCRYPTION_KEY"),
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptToken(
  ciphertext: string,
  secret: string = requireEnv("TOKEN_ENCRYPTION_KEY"),
): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(".");
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Malformed ciphertext");
  }
  const decipher = createDecipheriv(ALGORITHM, deriveKey(secret), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
