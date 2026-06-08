// Publish queue producer. The route enqueues; the worker (worker.ts) consumes and
// runs runPublishJob. Retries with exponential backoff (no setTimeout — BullMQ).
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { PublishJobData } from "@/lib/publish/job";

let queue: Queue<PublishJobData> | undefined;

function getPublishQueue(): Queue<PublishJobData> {
  queue ??= new Queue<PublishJobData>(QUEUE_NAMES.publish, { connection: redisConnection() });
  return queue;
}

export async function enqueuePublish(data: PublishJobData): Promise<string> {
  // Deterministic jobId dedupes duplicate enqueues (e.g. a double-clicked publish)
  // for the same item+account while a job is in flight.
  const job = await getPublishQueue().add("publish", data, {
    jobId: `publish:${data.itemId}:${data.connectedAccountId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  if (!job.id) throw new ExternalServiceError("Failed to enqueue publish job");
  return job.id;
}
