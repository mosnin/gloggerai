import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { jobs, type Job } from "@/db/schema";

export type JobKind = "publish_scheduled" | "embed_post" | "deliver_webhook";

export async function enqueue(opts: {
  kind: JobKind;
  payload: Record<string, unknown>;
  runAt?: Date;
  maxAttempts?: number;
}): Promise<Job> {
  const [row] = await db
    .insert(jobs)
    .values({
      kind: opts.kind,
      payload: opts.payload,
      runAt: opts.runAt ?? new Date(),
      maxAttempts: opts.maxAttempts ?? 5,
    })
    .returning();
  return row;
}

/** Atomically claim up to N due jobs using SKIP LOCKED so multiple workers don't collide. */
export async function claimJobs(workerId: string, batchSize: number): Promise<Job[]> {
  const res = await db.execute(sql`
    WITH claimed AS (
      SELECT id FROM jobs
      WHERE status = 'pending' AND run_at <= now()
      ORDER BY run_at
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE jobs SET
      status = 'running',
      locked_at = now(),
      locked_by = ${workerId},
      updated_at = now()
    WHERE id IN (SELECT id FROM claimed)
    RETURNING *
  `);
  return res.rows as unknown as Job[];
}

export async function completeJob(id: string): Promise<void> {
  await db.execute(sql`UPDATE jobs SET status='done', updated_at=now() WHERE id=${id}`);
}

export async function failJob(id: string, error: string, attempts: number, maxAttempts: number): Promise<void> {
  const terminal = attempts >= maxAttempts;
  const backoff = Math.min(60_000 * 2 ** Math.min(attempts, 8), 3_600_000);
  const nextRun = new Date(Date.now() + backoff);
  await db.execute(sql`
    UPDATE jobs SET
      status = ${terminal ? "failed" : "pending"},
      attempts = ${attempts},
      last_error = ${error.slice(0, 2000)},
      run_at = ${nextRun},
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
    WHERE id = ${id}
  `);
}
