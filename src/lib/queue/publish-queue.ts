// Publish queue producer. The route enqueues; the worker (worker.ts) consumes and
// runs runPublishJob. Retries with exponential backoff (no setTimeout — BullMQ).
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import type { PublishJobData } from "@/lib/publish/job";

let queue: Queue<PublishJobData> | undefined;

function getPublishQueue(): Queue<PublishJobData> {
  queue ??= new Queue<PublishJobData>(QUEUE_NAMES.publish, { connection: redisConnection() });
  return queue;
}

export async function enqueuePublish(data: PublishJobData): Promise<string> {
  const job = await getPublishQueue().add("publish", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  return job.id ?? "";
}
