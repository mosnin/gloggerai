/**
 * Zero-dependency structured logger. Emits one JSON line per call to stdout
 * (stderr for `error`) so the platform log pipeline can index it.
 */
type Level = "info" | "warn" | "error";

function write(level: Level, event: string, fields?: Record<string, unknown>): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(fields ?? {}),
  };
  let line: string;
  try {
    line = JSON.stringify(payload);
  } catch {
    line = JSON.stringify({
      ts: payload.ts,
      level,
      event,
      _serialize_error: true,
    });
  }
  if (level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const log = {
  info: (event: string, fields?: Record<string, unknown>) => write("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => write("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => write("error", event, fields),
};
