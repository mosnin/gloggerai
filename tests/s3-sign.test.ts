import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.S3_ENDPOINT = "https://s3.example.com";
  process.env.S3_REGION = "us-east-1";
  process.env.S3_ACCESS_KEY_ID = "AKIAFAKEKEY";
  process.env.S3_SECRET_ACCESS_KEY = "fakeSecretAccessKey1234567890";
  process.env.S3_BUCKET = "test-bucket";
});

describe("presignPutUrl", () => {
  it("includes the expected SigV4 query params, bucket and key", async () => {
    const { presignPutUrl } = await import("@/lib/uploads/s3-sign");
    const url = presignPutUrl({ key: "uploads/img.png", contentType: "image/png" });
    expect(url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(url).toContain("X-Amz-Signature=");
    expect(url).toContain("X-Amz-Credential=");
    expect(url).toContain("X-Amz-Date=");
    expect(url).toContain("X-Amz-Expires=");
    expect(url).toContain("X-Amz-SignedHeaders=host");
    expect(url).toContain("test-bucket");
    expect(url).toContain("uploads/img.png");
    expect(url.startsWith("https://s3.example.com/")).toBe(true);
  });

  it("produces deterministic signatures for a fixed Date", async () => {
    const { presignPutUrl } = await import("@/lib/uploads/s3-sign");
    const RealDate = Date;
    const FIXED = new RealDate("2025-01-15T12:00:00Z");
    // Monkey-patch: zero-arg `new Date()` returns FIXED.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).Date = class extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(FIXED.getTime());
        } else {
          // @ts-expect-error spread to base
          super(...args);
        }
      }
      static now() {
        return FIXED.getTime();
      }
    };
    try {
      const a = presignPutUrl({ key: "uploads/x.png", contentType: "image/png" });
      const b = presignPutUrl({ key: "uploads/x.png", contentType: "image/png" });
      expect(a).toBe(b);
      expect(a).toContain("X-Amz-Date=20250115T120000Z");
    } finally {
      (globalThis as { Date: typeof Date }).Date = RealDate;
    }
  });
});
