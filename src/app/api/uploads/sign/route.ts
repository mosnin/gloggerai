import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth-guard";
import { fail, ok } from "@/lib/api/response";
import { s3Configured } from "@/lib/env";
import { presignPutUrl, publicUrlFor } from "@/lib/uploads/s3-sign";

const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/gif": "gif",
};

const MAX_BYTES = 10 * 1024 * 1024;

const Body = z.object({
  contentType: z.string(),
  byteSize: z.number().int().positive().max(MAX_BYTES),
});

export async function POST(req: NextRequest) {
  if (!s3Configured) return fail("uploads_disabled", "S3 not configured on the server", 503);
  const auth = await authenticate(req);
  if (auth instanceof Response) return auth;
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return fail("invalid_body", "Invalid request body", 422, parsed.error.flatten());

  const ext = ALLOWED_TYPES[parsed.data.contentType];
  if (!ext) return fail("unsupported_type", "Only image/jpeg, png, webp, avif, gif are allowed", 415);

  const key = `posts/${auth.user.id}/${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`;
  const uploadUrl = presignPutUrl({ key, contentType: parsed.data.contentType, expiresInSeconds: 600 });
  return ok({
    uploadUrl,
    method: "PUT",
    headers: { "content-type": parsed.data.contentType },
    publicUrl: publicUrlFor(key),
    key,
    expiresInSeconds: 600,
    maxBytes: MAX_BYTES,
  });
}
