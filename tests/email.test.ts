import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("sendEmail", () => {
  const origEnv = { ...process.env };
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    process.env.SESSION_SECRET = "x".repeat(40);
    process.env.DATABASE_URL = "postgres://x:x@localhost:5432/x";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.unstubAllGlobals();
  });

  it("falls back to console when RESEND_API_KEY is unset", async () => {
    const { sendEmail } = await import("@/lib/email/send");
    const r = await sendEmail({ to: "a@b.com", subject: "hi", text: "body" });
    expect(r.provider).toBe("console");
    expect(r.delivered).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Resend when configured and returns delivered=true on 200", async () => {
    process.env.RESEND_API_KEY = "re_test_xxx";
    process.env.EMAIL_FROM = "noreply@example.com";
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "abc-123" }), { status: 200 }),
    );
    const { sendEmail } = await import("@/lib/email/send");
    const r = await sendEmail({ to: "x@y.com", subject: "subject", text: "body", tag: "verify-email" });
    expect(r).toEqual({ delivered: true, provider: "resend", id: "abc-123" });
    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    const body = JSON.parse(init.body as string);
    expect(body.from).toBe("noreply@example.com");
    expect(body.to).toEqual(["x@y.com"]);
    expect(body.tags).toEqual([{ name: "category", value: "verify-email" }]);
  });

  it("returns delivered=false on non-2xx", async () => {
    process.env.RESEND_API_KEY = "re_test_xxx";
    process.env.EMAIL_FROM = "noreply@example.com";
    fetchSpy.mockResolvedValueOnce(new Response("bad request", { status: 400 }));
    const { sendEmail } = await import("@/lib/email/send");
    const r = await sendEmail({ to: "x@y.com", subject: "s", text: "b" });
    expect(r.delivered).toBe(false);
  });
});
