// Media-retention queue producer + repeatable registration (P4-10 follow-up). A
// heartbeat (MEDIA_RETENTION_MS, default 1 day) that sweeps every client to
// soft-archive stale assets and purge ones archived long enough. Set
// MEDIA_RETENTION_MS=0 to disable the schedule. Mirrors the report-digest tick.
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { getEnv } from "@/lib/config/env";
import type { MediaRetentionJobData } from "./media-retention-job";

let queue: Queue<MediaRetentionJobData> | undefined;

function getMediaRetentionQueue(): Queue<MediaRetentionJobData> {
  queue ??= new Queue<MediaRetentionJobData>(QUEUE_NAMES.mediaRetention, {
    connection: redisConnection(),
  });
  return queue;
}

/** Install the repeatable sweep, unless disabled (MEDIA_RETENTION_MS=0). Idempotent. */
export async function registerMediaRetention(): Promise<boolean> {
  const every = getEnv().MEDIA_RETENTION_MS;
  if (every <= 0) return false;
  await getMediaRetentionQueue().add(
    "media-retention",
    { trigger: "cron" },
    { repeat: { every }, removeOnComplete: 50, removeOnFail: 50 },
  );
  return true;
}
