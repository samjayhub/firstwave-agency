// Video queue producer. Routes enqueue; the worker (worker.ts) consumes.
// Deterministic jobId dedupes concurrent triggers for the same content item.
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { VideoJobData } from "./video-job";

let queue: Queue<VideoJobData> | undefined;

function getVideoQueue(): Queue<VideoJobData> {
  queue ??= new Queue<VideoJobData>(QUEUE_NAMES.produceVideo, {
    connection: redisConnection(),
  });
  return queue;
}

export async function enqueueVideo(data: VideoJobData): Promise<string> {
  const job = await getVideoQueue().add("video", data, {
    jobId: `video:${data.agencyId}:${data.itemId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  if (!job.id) throw new ExternalServiceError("Failed to enqueue video job");
  return job.id;
}
