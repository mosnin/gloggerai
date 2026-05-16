import { randomUUID } from "node:crypto";
import { claimJobs, completeJob, failJob } from "./queue";
import { handleDeliverWebhook, handleEmbedPost, handlePublishScheduled } from "./handlers";

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
    } catch (err) {
      await failJob(job.id, err instanceof Error ? err.message : String(err), attempts, job.maxAttempts);
    }
  }
  return claimed.length;
}

/** Run the worker forever. Sleeps when no work. */
export async function runWorker(opts: { intervalMs?: number } = {}): Promise<void> {
  const interval = opts.intervalMs ?? 2_000;
  console.log(`[jobs] starting ${WORKER_ID}`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const n = await tick().catch((err) => {
      console.error("[jobs] tick error", err);
      return 0;
    });
    if (n === 0) await new Promise((r) => setTimeout(r, interval));
  }
}

/** One-shot processing — for serverless cron triggers. */
export async function runOnce(): Promise<number> {
  return tick();
}
