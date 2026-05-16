import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { fail } from "./response";

const COOKIE = "glogger_csrf";
const HEADER = "x-csrf-token";
const TTL_DAYS = 7;

function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function issueCsrfToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing && existing.length >= 32) return existing;
  const token = newToken();
  jar.set(COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + TTL_DAYS * 86_400_000),
  });
  return token;
}

export async function refreshCsrfToken(): Promise<string> {
  const jar = await cookies();
  const token = newToken();
  jar.set(COOKIE, token, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(Date.now() + TTL_DAYS * 86_400_000),
  });
  return token;
}

function safeEq(a: string, b: string): boolean {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

/** Returns null on success, Response on failure. Bearer-key requests are exempt. */
export async function requireCsrf(req: NextRequest): Promise<Response | null> {
  if (req.headers.get("authorization")?.toLowerCase().startsWith("bearer ")) return null;
  const jar = await cookies();
  const cookieToken = jar.get(COOKIE)?.value;
  const headerToken = req.headers.get(HEADER);
  if (!cookieToken || !headerToken) return fail("csrf_missing", "CSRF token required", 403);
  if (!safeEq(cookieToken, headerToken)) return fail("csrf_invalid", "CSRF token mismatch", 403);
  return null;
}
