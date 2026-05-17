/**
 * SSRF guard for outbound URLs that users register (webhooks today; could
 * apply to RSS-import or canonical-link checks later). Blocks loopback,
 * private RFC1918, link-local, cloud metadata service, and anything that
 * isn't an http(s) URL with a public-routable hostname.
 *
 * Two layers:
 *   - validateOutboundUrl(): host-string validation at registration time.
 *     Rejects obvious metadata hosts (169.254.169.254, metadata.*) by name
 *     so we don't waste a DNS lookup.
 *   - resolveAndCheck(): DNS-resolves the hostname and rejects if any
 *     returned IP is in a private/reserved range. Run this BEFORE the
 *     actual fetch (a DNS rebinding attacker can register a public name
 *     that resolves to 127.0.0.1 only at delivery time).
 */
import { lookup } from "node:dns/promises";
import net from "node:net";

const BLOCKED_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.goog",
  "metadata",
  "instance-data",
  "169.254.169.254",
  "fd00:ec2::254",
  "localhost",
  "ip6-localhost",
  "ip6-loopback",
  "broadcasthost",
]);

const BLOCKED_HOSTNAME_PATTERNS: RegExp[] = [
  /\.local$/i,
  /\.internal$/i,
  /\.localdomain$/i,
];

export type UrlCheckResult =
  | { ok: true; resolvedIps: string[] }
  | { ok: false; reason: string };

/**
 * String-only validation. Use this at registration time to reject obviously
 * unsafe URLs before storing them. Does NOT do DNS — that's resolveAndCheck.
 */
export function validateOutboundUrl(input: string): UrlCheckResult {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, reason: "not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: `protocol ${url.protocol} not allowed (http or https only)` };
  }
  if (process.env.NODE_ENV === "production" && url.protocol === "http:") {
    return { ok: false, reason: "production webhooks must use https" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "credentials in URL not allowed" };
  }

  // URL parser leaves IPv6 literals bracketed in url.hostname; strip for the
  // IP-range check while keeping the bracketed form for lookup later.
  const rawHost = url.hostname.toLowerCase();
  const host = rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;
  if (!host) return { ok: false, reason: "missing hostname" };
  if (BLOCKED_HOSTNAMES.has(host)) {
    return { ok: false, reason: `hostname ${host} is blocked` };
  }
  for (const pat of BLOCKED_HOSTNAME_PATTERNS) {
    if (pat.test(host)) return { ok: false, reason: `hostname matches blocked pattern ${pat.source}` };
  }

  // If the host is literally an IP, reject privates eagerly.
  if (net.isIP(host)) {
    if (isPrivateIp(host)) {
      return { ok: false, reason: `IP ${host} is in a reserved/private range` };
    }
  }

  return { ok: true, resolvedIps: [] };
}

/**
 * Full check: string validation + DNS resolution + per-IP private-range
 * check. Use this immediately before fetch() to defeat DNS rebinding.
 *
 * Returns the resolved IPs so the caller can (optionally) bypass DNS in
 * its fetch — wiring that into Node's fetch needs an explicit `lookup`
 * agent which we don't do today. The TOCTOU window between resolve here
 * and resolve-inside-fetch is small but real; revisit if we ever care.
 */
export async function resolveAndCheck(input: string): Promise<UrlCheckResult> {
  const stringCheck = validateOutboundUrl(input);
  if (!stringCheck.ok) return stringCheck;
  const rawHost = new URL(input).hostname.toLowerCase();
  const host = rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;
  if (net.isIP(host)) return { ok: true, resolvedIps: [host] };
  try {
    const addrs = await lookup(host, { all: true, verbatim: true });
    if (addrs.length === 0) return { ok: false, reason: `no A/AAAA records for ${host}` };
    for (const a of addrs) {
      if (isPrivateIp(a.address)) {
        return { ok: false, reason: `${host} resolves to private IP ${a.address}` };
      }
    }
    return { ok: true, resolvedIps: addrs.map((a) => a.address) };
  } catch (err) {
    return { ok: false, reason: `DNS lookup failed: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function isPrivateIp(addr: string): boolean {
  if (net.isIPv4(addr)) return isPrivateIpv4(addr);
  if (net.isIPv6(addr)) return isPrivateIpv6(addr);
  return true; // unknown → safer to block
}

function isPrivateIpv4(addr: string): boolean {
  const parts = addr.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts;
  // 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12,
  // 192.168.0.0/16, 100.64.0.0/10 (CGNAT), 224.0.0.0/4 (multicast),
  // 240.0.0.0/4 (reserved future use incl. 255.255.255.255 broadcast).
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a >= 224) return true;
  return false;
}

function isPrivateIpv6(addr: string): boolean {
  const lower = addr.toLowerCase();
  if (lower === "::1" || lower === "::") return true; // loopback / unspecified
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // ULA fc00::/7
  if (lower.startsWith("fe80")) return true; // link-local
  if (lower.startsWith("ff")) return true; // multicast
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped. Two canonical forms: ::ffff:1.2.3.4 (dotted) or
    // ::ffff:0102:0304 (Node's WHATWG URL parser normalizes to this).
    const tail = lower.slice(7);
    if (net.isIPv4(tail)) return isPrivateIpv4(tail);
    const m = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (m) {
      const h1 = parseInt(m[1], 16);
      const h2 = parseInt(m[2], 16);
      const v4 = `${(h1 >> 8) & 0xff}.${h1 & 0xff}.${(h2 >> 8) & 0xff}.${h2 & 0xff}`;
      return isPrivateIpv4(v4);
    }
  }
  return false;
}
