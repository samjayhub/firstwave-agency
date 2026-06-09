// Report-digest queue producer + repeatable registration (P4-07). A heartbeat
// (REPORT_DIGEST_MS, default 7 days) that emails each agency a branded
// performance report per client. Set REPORT_DIGEST_MS=0 to disable the schedule.
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { getEnv } from "@/lib/config/env";

export interface ReportDigestJobData {
  trigger: "cron";
}

let queue: Queue<ReportDigestJobData> | undefined;

function getReportDigestQueue(): Queue<ReportDigestJobData> {
  queue ??= new Queue<ReportDigestJobData>(QUEUE_NAMES.reportDigest, {
    connection: redisConnection(),
  });
  return queue;
}

/** Install the repeatable digest, unless disabled (REPORT_DIGEST_MS=0). Idempotent. */
export async function registerReportDigest(): Promise<boolean> {
  const every = getEnv().REPORT_DIGEST_MS;
  if (every <= 0) return false;
  await getReportDigestQueue().add(
    "report-digest",
    { trigger: "cron" },
    { repeat: { every }, removeOnComplete: 50, removeOnFail: 50 },
  );
  return true;
}
