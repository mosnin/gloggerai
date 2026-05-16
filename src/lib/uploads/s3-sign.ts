/**
 * Minimal AWS Signature Version 4 presigned PUT URL generator.
 * Compatible with S3, Cloudflare R2, Backblaze B2, MinIO. Zero deps.
 */
import { createHash, createHmac } from "node:crypto";
import { env } from "@/lib/env";

const SERVICE = "s3";

function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const kDate = hmac(`AWS4${secret}`, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

function awsEncode(s: string, encodeSlash = true): string {
  return s
    .split("")
    .map((c) => {
      if (/[A-Za-z0-9_.~-]/.test(c)) return c;
      if (c === "/" && !encodeSlash) return c;
      return "%" + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0");
    })
    .join("");
}

export function presignPutUrl(opts: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): string {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY || !env.S3_BUCKET) {
    throw new Error("S3 not configured");
  }
  const expires = Math.min(Math.max(opts.expiresInSeconds ?? 600, 60), 3600);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const region = env.S3_REGION || "auto";
  const host = new URL(env.S3_ENDPOINT).host;
  const credentialScope = `${date}/${region}/${SERVICE}/aws4_request`;
  const credential = `${env.S3_ACCESS_KEY_ID}/${credentialScope}`;

  const canonicalUri = `/${env.S3_BUCKET}/${awsEncode(opts.key, false)}`;
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  });
  params.sort();
  const canonicalQuery = [...params.entries()]
    .map(([k, v]) => `${awsEncode(k)}=${awsEncode(v)}`)
    .join("&");

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const key = signingKey(env.S3_SECRET_ACCESS_KEY, date, region);
  const signature = createHmac("sha256", key).update(stringToSign).digest("hex");

  return `${env.S3_ENDPOINT.replace(/\/$/, "")}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export function publicUrlFor(key: string): string {
  if (env.S3_PUBLIC_BASE_URL) return `${env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
  return `${env.S3_ENDPOINT!.replace(/\/$/, "")}/${env.S3_BUCKET}/${key}`;
}
