// Scheduler-tick job handler — the unit the repeatable BullMQ job runs. Pure DI
// so it is testable without Redis. Delegates to SchedulerService.tick(), which
// enqueues a publish job for every content item whose scheduled time has come.
import type { SchedulerService, TickResult } from "@/lib/scheduler";

/** `cron` = the repeatable heartbeat; `manual` = an ops-triggered one-off. */
export interface SchedulerTickJobData {
  trigger: "cron" | "manual";
}

export interface SchedulerJobDeps {
  scheduler: SchedulerService;
}

export async function runSchedulerJob(
  deps: SchedulerJobDeps,
  _data: SchedulerTickJobData,
): Promise<TickResult> {
  return deps.scheduler.tick();
}
