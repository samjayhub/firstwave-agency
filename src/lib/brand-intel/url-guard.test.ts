import { describe, it, expect } from "vitest";
import { isPrivateIp, isPrivateIpv4, assertPublicUrl } from "./url-guard";

describe("isPrivateIpv4", () => {
  it("flags private / reserved ranges (incl. cloud metadata)", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
    ]) {
      expect(isPrivateIpv4(ip)).toBe(true);
    }
  });

  it("allows public IPv4", () => {
    expect(isPrivateIpv4("93.184.216.34")).toBe(false);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
  });
});

describe("isPrivateIp (IPv6)", () => {
  it("flags loopback / link-local / ULA / v4-mapped-private", () => {
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows public IPv6", () => {
    expect(isPrivateIp("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });
});

describe("assertPublicUrl", () => {
  const publicLookup = async () => ["93.184.216.34"];
  const privateLookup = async () => ["10.0.0.5"];

  it("allows a public http(s) host", async () => {
    await expect(assertPublicUrl("https://example.com", publicLookup)).resolves.toBeUndefined();
  });

  it("rejects non-http(s) schemes", async () => {
    await expect(assertPublicUrl("file:///etc/passwd", publicLookup)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects a private IP literal without needing DNS", async () => {
    await expect(
      assertPublicUrl("http://169.254.169.254/latest/meta-data", publicLookup),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rejects a hostname that resolves to a private address (rebinding)", async () => {
    await expect(assertPublicUrl("http://rebind.evil.test", privateLookup)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rejects an invalid URL", async () => {
    await expect(assertPublicUrl("not a url", publicLookup)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
