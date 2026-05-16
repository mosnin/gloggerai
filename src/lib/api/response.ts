import { NextResponse } from "next/server";

export type ApiError = {
  error: { code: string; message: string; details?: unknown };
};

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(code: string, message: string, status: number, details?: unknown): NextResponse {
  const body: ApiError = { error: { code, message, ...(details ? { details } : {}) } };
  return NextResponse.json(body, { status });
}
