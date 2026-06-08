// SSRF guard for the crawler. The crawl target is user-supplied, so before any
// navigation we (1) allow only http(s) and (2) reject hosts that resolve to a
// private/loopback/link-local/metadata address (incl. 169.254.169.254). DNS is
// resolved here so a public-looking hostname pointing at an internal IP is
// rejected. Residual DNS-rebinding/redirect risk is further mitigated by request
// interception in the crawler and should run network-isolated in production.
import { lookup as dnsLookup } from "node:dns/promises";
import { ValidationError } from "@/lib/errors/app-error";

export type AddressLookup = (hostname: string) => Promise<string[]>;

const defaultLookup: AddressLookup = async (hostname) => {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((r) => r.address);
};

export function isIpv4Literal(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 192 && b === 0) return true; // 192.0.0/24 (and 192.0.2 test-net)
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

export function isPrivateIp(ip: string): boolean {
  const host = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIpv4Literal(host)) return isPrivateIpv4(host);

  // IPv6
  if (host === "::1" || host === "::") return true; // loopback / unspecified
  if (host.startsWith("fe8") || host.startsWith("fe9") || host.startsWith("fea") || host.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  if (host.startsWith("fc") || host.startsWith("fd")) return true; // fc00::/7 ULA
  const mapped = host.match(/::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  // v4-mapped in hex form (e.g. ::ffff:7f00:1 after URL normalization). These
  // are not legitimate public crawl targets — treat any v4-mapped literal as
  // unsafe to close the metadata/loopback reach-around.
  if (host.startsWith("::ffff:")) return true;
  return false; // unknown IPv6 → treat as public (best effort)
}

/**
 * Throw unless `url` is a public http(s) address. Resolves DNS to catch hostnames
 * that map to internal IPs. `lookup` is injectable for tests.
 */
export async function assertPublicUrl(
  url: string,
  lookup: AddressLookup = defaultLookup,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ValidationError("websiteUrl is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError("Only http(s) URLs may be crawled");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (isIpv4Literal(host) || host.includes(":")) {
    if (isPrivateIp(host)) {
      throw new ValidationError("Refusing to crawl a private or internal address");
    }
    return;
  }

  const addresses = await lookup(host);
  if (addresses.length === 0) {
    throw new ValidationError("websiteUrl host could not be resolved");
  }
  if (addresses.some((addr) => isPrivateIp(addr))) {
    throw new ValidationError("websiteUrl resolves to a private or internal address");
  }
}
