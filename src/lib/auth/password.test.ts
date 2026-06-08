import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("hashes to the scrypt format and verifies the correct password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$[0-9a-f]+\$[0-9a-f]+$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different salt/hash each time", async () => {
    expect(await hashPassword("samepassword1")).not.toBe(await hashPassword("samepassword1"));
  });

  it("rejects too-short passwords", async () => {
    await expect(hashPassword("short")).rejects.toThrow();
  });

  it("returns false for a malformed stored hash", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$abcd")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$aa$bb")).toBe(false);
  });
});
