import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("captureException", () => {
  const origEnv = { ...process.env };
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    process.env.SESSION_SECRET = "x".repeat(40);
    process.env.DATABASE_URL = "postgres://x:x@localhost:5432/x";
    delete process.env.SENTRY_DSN;
    fetchSpy = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.unstubAllGlobals();
  });

  it("is a no-op when SENTRY_DSN is unset", async () => {
    const { captureException } = await import("@/lib/observability/sentry");
    captureException(new Error("test"));
    await new Promise((r) => setTimeout(r, 5));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts an envelope to the store endpoint when DSN is set", async () => {
    process.env.SENTRY_DSN = "https://abc123@sentry.example.com/42";
    const { captureException } = await import("@/lib/observability/sentry");
    captureException(new Error("boom"), { rid: "r-1" });
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://sentry.example.com/api/42/store/");
    expect(url).toContain("sentry_key=abc123");
    const body = JSON.parse(init.body as string);
    expect(body.exception.values[0].value).toBe("boom");
    expect(body.extra.rid).toBe("r-1");
  });
});
