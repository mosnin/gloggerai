import { describe, it, expect } from "vitest";
import { validateOutboundUrl } from "@/lib/security/url-allowlist";

describe("validateOutboundUrl", () => {
  it("accepts public https hostnames", () => {
    expect(validateOutboundUrl("https://example.com/hook").ok).toBe(true);
    expect(validateOutboundUrl("https://api.user.dev/x").ok).toBe(true);
  });

  it("rejects non-http(s) schemes", () => {
    expect(validateOutboundUrl("file:///etc/passwd").ok).toBe(false);
    expect(validateOutboundUrl("ftp://example.com").ok).toBe(false);
    expect(validateOutboundUrl("javascript:alert(1)").ok).toBe(false);
    expect(validateOutboundUrl("data:text/plain,foo").ok).toBe(false);
  });

  it("rejects URLs with credentials", () => {
    expect(validateOutboundUrl("https://user:pass@example.com/").ok).toBe(false);
  });

  it("rejects loopback literal IPs", () => {
    expect(validateOutboundUrl("http://127.0.0.1:3000/").ok).toBe(false);
    expect(validateOutboundUrl("http://0.0.0.0/").ok).toBe(false);
    expect(validateOutboundUrl("http://[::1]/").ok).toBe(false);
  });

  it("rejects RFC1918 private ranges", () => {
    expect(validateOutboundUrl("http://10.0.0.1/").ok).toBe(false);
    expect(validateOutboundUrl("http://172.16.0.1/").ok).toBe(false);
    expect(validateOutboundUrl("http://172.31.255.255/").ok).toBe(false);
    expect(validateOutboundUrl("http://192.168.1.1/").ok).toBe(false);
    expect(validateOutboundUrl("http://100.64.0.1/").ok).toBe(false);
  });

  it("rejects link-local + multicast + reserved IPv4", () => {
    expect(validateOutboundUrl("http://169.254.169.254/").ok).toBe(false);
    expect(validateOutboundUrl("http://224.0.0.1/").ok).toBe(false);
    expect(validateOutboundUrl("http://255.255.255.255/").ok).toBe(false);
  });

  it("rejects ULA + link-local IPv6 + multicast", () => {
    expect(validateOutboundUrl("http://[fd00::1]/").ok).toBe(false);
    expect(validateOutboundUrl("http://[fc00::1]/").ok).toBe(false);
    expect(validateOutboundUrl("http://[fe80::1]/").ok).toBe(false);
    expect(validateOutboundUrl("http://[ff02::1]/").ok).toBe(false);
  });

  it("rejects IPv4-mapped IPv6 loopback", () => {
    expect(validateOutboundUrl("http://[::ffff:127.0.0.1]/").ok).toBe(false);
  });

  it("rejects metadata-service hostnames by name", () => {
    expect(validateOutboundUrl("http://metadata.google.internal/").ok).toBe(false);
    expect(validateOutboundUrl("http://instance-data/").ok).toBe(false);
    expect(validateOutboundUrl("http://localhost/").ok).toBe(false);
  });

  it("rejects .local and .internal suffixes", () => {
    expect(validateOutboundUrl("http://myhost.local/").ok).toBe(false);
    expect(validateOutboundUrl("http://service.internal/").ok).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(validateOutboundUrl("not a url").ok).toBe(false);
    expect(validateOutboundUrl("").ok).toBe(false);
  });
});
