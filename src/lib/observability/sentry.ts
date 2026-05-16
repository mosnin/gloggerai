/**
 * Zero-dep Sentry capture. Uses the public store endpoint with a DSN.
 * Fire-and-forget; never throws back into the caller. No-op when SENTRY_DSN
 * isn't set. Add @sentry/node when you need stack-trace symbolication, traces,
 * and proper transports — this is the floor.
 */
import { env } from "@/lib/env";

type DsnParts = { protocol: string; publicKey: string; host: string; projectId: string };

function parseDsn(dsn: string): DsnParts | null {
  try {
    const u = new URL(dsn);
    return {
      protocol: u.protocol.replace(":", ""),
      publicKey: u.username,
      host: u.host,
      projectId: u.pathname.replace(/^\//, ""),
    };
  } catch {
    return null;
  }
}

function release(): string | undefined {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.SOURCE_VERSION ?? undefined;
}

export function captureException(err: unknown, extra?: Record<string, unknown>): void {
  if (!env.SENTRY_DSN) return;
  const parts = parseDsn(env.SENTRY_DSN);
  if (!parts) return;
  const url = `${parts.protocol}://${parts.host}/api/${parts.projectId}/store/?sentry_key=${parts.publicKey}&sentry_version=7`;
  const e = err instanceof Error ? err : new Error(String(err));
  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: new Date().toISOString(),
    level: "error",
    platform: "node",
    release: release(),
    environment: process.env.NODE_ENV ?? "development",
    exception: {
      values: [
        {
          type: e.name,
          value: e.message,
          stacktrace: stackFrames(e),
        },
      ],
    },
    extra,
  };
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(3000),
  }).catch(() => {});
}

function stackFrames(e: Error): { frames: Array<{ filename?: string; function?: string; lineno?: number; colno?: number }> } | undefined {
  if (!e.stack) return undefined;
  const lines = e.stack.split("\n").slice(1);
  const frames = lines
    .map((line) => {
      const m = line.match(/at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/);
      if (!m) return null;
      return {
        function: m[1] ?? "<anonymous>",
        filename: m[2],
        lineno: Number(m[3]),
        colno: Number(m[4]),
      };
    })
    .filter(Boolean) as Array<{ filename?: string; function?: string; lineno?: number; colno?: number }>;
  if (!frames.length) return undefined;
  return { frames: frames.reverse() };
}
