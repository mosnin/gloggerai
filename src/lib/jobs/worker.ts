import { randomUUID } from "node:crypto";
import { claimJobs, completeJob, failJob } from "./queue";
import { handleDeliverWebhook, handleEmbedPost, handlePublishScheduled } from "./handlers";
import { log } from "@/lib/observability/logger";

const WORKER_ID = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
const BATCH = 10;

async function tick() {
  const claimed = await claimJobs(WORKER_ID, BATCH);
  for (const job of claimed) {
    const attempts = job.attempts + 1;
    try {
      const payload = job.payload as Record<string, never>;
      switch (job.kind) {
        case "publish_scheduled":
          await handlePublishScheduled(payload as unknown as { postId: string });
          break;
        case "embed_post":
          await handleEmbedPost(payload as unknown as { postId: string });
          break;
        case "deliver_webhook":
          await handleDeliverWebhook(payload as unknown as { deliveryId: string });
          break;
      }
      await completeJob(job.id);
      log.info("job.completed", { workerId: WORKER_ID, jobId: job.id, kind: job.kind, attempts });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error("job.failed", {
        workerId: WORKER_ID,
        jobId: job.id,
        kind: job.kind,
        attempts,
        maxAttempts: job.maxAttempts,
        error: message,
      });
      await failJob(job.id, message, attempts, job.maxAttempts);
    }
  }
  return claimed.length;
}

/** Run the worker forever. Sleeps when no work. Stops cleanly on SIGTERM/SIGINT. */
export async function runWorker(opts: { intervalMs?: number } = {}): Promise<void> {
  const interval = opts.intervalMs ?? 2_000;
  log.info("jobs.worker_started", { workerId: WORKER_ID, intervalMs: interval, batch: BATCH });

  let shouldStop = false;
  let wake: (() => void) | null = null;
  const onSignal = (sig: NodeJS.Signals) => {
    if (shouldStop) return;
    shouldStop = true;
    log.info("jobs.shutdown_signal", { workerId: WORKER_ID, signal: sig });
    if (wake) wake();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);

  try {
    while (!shouldStop) {
      const n = await tick().catch((err) => {
        log.error("jobs.tick_error", {
          workerId: WORKER_ID,
          error: err instanceof Error ? err.message : String(err),
        });
        return 0;
      });
      if (shouldStop) break;
      if (n === 0) {
        await new Promise<void>((r) => {
          wake = r;
          const t = setTimeout(() => {
            wake = null;
            r();
          }, interval);
          if (typeof t.unref === "function") t.unref();
        });
      }
    }
  } finally {
    process.off("SIGTERM", onSignal);
    process.off("SIGINT", onSignal);
    log.info("jobs.worker_stopped", { workerId: WORKER_ID });
  }
}

/** One-shot processing — for serverless cron triggers. */
export async function runOnce(): Promise<number> {
  return tick();
}
