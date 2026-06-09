// Media-retention job handler (P4-10 follow-up) — the unit the repeatable BullMQ
// job runs. Pure DI so it is testable without Redis. Delegates to the library's
// system-wide sweep: soft-archive stale assets, then purge ones archived long
// enough (when PURGE_DAYS > 0). `purgeDays = null` means archive only.
import type { MediaLibraryService } from "@/lib/media";

export interface MediaRetentionJobData {
  trigger: "cron" | "manual";
}

export interface MediaRetentionJobDeps {
  media: MediaLibraryService;
  retentionDays: number;
  purgeDays: number | null;
}

export async function runMediaRetentionJob(
  deps: MediaRetentionJobDeps,
  _data: MediaRetentionJobData,
) {
  return deps.media.runRetentionSweep(deps.retentionDays, deps.purgeDays);
}
