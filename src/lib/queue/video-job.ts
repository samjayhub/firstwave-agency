// Video job handler — the pure function the BullMQ worker runs. Fully injectable so
// it is testable without Redis. The VideoStudioService calls withAudit internally
// for the script/B-roll/TTS calls, so no audit logic lives here.
import type { TenantContext } from "@/lib/db/tenancy";
import type { VideoStudioService } from "@/lib/video";

export interface VideoJobData {
  agencyId: string;
  itemId: string;
  painPoint?: string;
  targetSeconds?: number;
}

export interface VideoJobDeps {
  video: VideoStudioService;
}

export async function runVideoJob(deps: VideoJobDeps, data: VideoJobData): Promise<void> {
  const ctx: TenantContext = { agencyId: data.agencyId };
  await deps.video.produceVideo(ctx, data.itemId, {
    painPoint: data.painPoint,
    targetSeconds: data.targetSeconds,
  });
}
