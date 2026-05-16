import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

function b64urlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function b64urlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

function hmac(payload: string): string {
  return createHmac("sha256", env.SESSION_SECRET).update(payload).digest("base64url");
}

export function signPreviewToken(postId: string, expiresInSec = 86400): string {
  const expSec = Math.floor(Date.now() / 1000) + expiresInSec;
  const idPart = b64urlEncode(postId);
  const payload = `${idPart}.${expSec}`;
  const sig = hmac(payload);
  return `${payload}.${sig}`;
}

export function verifyPreviewToken(token: string): { postId: string; expiresAt: Date } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [idPart, expStr, sig] = parts;
  const expSec = Number(expStr);
  if (!Number.isFinite(expSec)) return null;
  const expected = hmac(`${idPart}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (expSec * 1000 < Date.now()) return null;
  try {
    const postId = b64urlDecode(idPart).toString("utf8");
    if (!postId) return null;
    return { postId, expiresAt: new Date(expSec * 1000) };
  } catch {
    return null;
  }
}
