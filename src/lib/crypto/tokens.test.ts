import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken } from "./tokens";

const SECRET = "a-test-encryption-key-32-chars-min!!";

describe("token encryption", () => {
  it("round-trips a token and carries a version prefix", () => {
    const enc = encryptToken("urn:li:token:abc123", SECRET);
    expect(enc).not.toContain("abc123"); // ciphertext, not plaintext
    expect(enc.startsWith("v1.")).toBe(true);
    expect(decryptToken(enc, SECRET)).toBe("urn:li:token:abc123");
  });

  it("produces a different ciphertext each time (random IV)", () => {
    expect(encryptToken("same", SECRET)).not.toBe(encryptToken("same", SECRET));
  });

  it("fails to decrypt with the wrong key", () => {
    const enc = encryptToken("secret", SECRET);
    expect(() => decryptToken(enc, "a-different-key-also-32-chars-long!!")).toThrow();
  });

  it("fails to decrypt tampered ciphertext (GCM auth tag)", () => {
    const enc = encryptToken("secret", SECRET);
    const [version, iv, tag] = enc.split(".");
    const tampered = [version, iv, tag, Buffer.from("tampered-bytes-xxxxxxxx").toString("base64")].join(".");
    expect(() => decryptToken(tampered, SECRET)).toThrow();
  });

  it("rejects a malformed ciphertext", () => {
    expect(() => decryptToken("not-valid", SECRET)).toThrow(/Malformed/);
  });
});
