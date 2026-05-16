#!/usr/bin/env node
import { runWorker } from "@/lib/jobs/worker";
runWorker().catch((err) => {
  console.error(err);
  process.exit(1);
});
