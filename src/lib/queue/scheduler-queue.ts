// Scheduler-tick queue producer + repeatable registration. The worker
// (worker.ts) consumes the tick and runs SchedulerService. Unlike the other
// queues this one is driven by a BullMQ *repeatable* job (a heartbeat) rather
// than per-request enqueues, so publishing happens on a clock with no setTimeout.
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { getEnv } from "@/lib/config/env";
import type { SchedulerTickJobData } from "./scheduler-job";

let queue: Queue<SchedulerTickJobData> | undefined;

function getSchedulerQueue(): Queue<SchedulerTickJobData> {
  queue ??= new Queue<SchedulerTickJobData>(QUEUE_NAMES.schedulerTick, {
    connection: redisConnection(),
  });
  return queue;
}

/**
 * Register the repeatable tick. Idempotent — BullMQ dedupes by the repeat key,
 * so calling this on every worker boot is safe. Cadence is SCHEDULER_TICK_MS.
 */
export async function registerSchedulerTick(): Promise<void> {
  await getSchedulerQueue().add(
    "scheduler-tick",
    { trigger: "cron" },
    {
      repeat: { every: getEnv().SCHEDULER_TICK_MS },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
}
