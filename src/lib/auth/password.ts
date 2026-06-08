// Password hashing with scrypt (Node's built-in memory-hard KDF) — no external
// dependency. Stored format: `scrypt$<saltHex>$<hashHex>`. Verification is
// constant-time via timingSafeEqual.
import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { ValidationError } from "@/lib/errors/app-error";

const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

const KEY_LEN = 64;
const SALT_BYTES = 16;
export const MIN_PASSWORD_LENGTH = 8;

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    );
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = await scryptAsync(password, salt, KEY_LEN);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  if (expected.length === 0) return false;
  const derived = await scryptAsync(password, salt, expected.length);
  // Lengths are equal by construction, but guard before timingSafeEqual.
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
