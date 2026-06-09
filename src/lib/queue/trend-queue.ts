// Trend queue producer. Routes enqueue; the worker (worker.ts) consumes.
// Deterministic jobId dedupes concurrent triggers for the same client.
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { TrendJobData } from "./trend-job";

let queue: Queue<TrendJobData> | undefined;

function getTrendQueue(): Queue<TrendJobData> {
  queue ??= new Queue<TrendJobData>(QUEUE_NAMES.trendSweep, {
    connection: redisConnection(),
  });
  return queue;
}

export async function enqueueTrend(data: TrendJobData): Promise<string> {
  const job = await getTrendQueue().add("trend", data, {
    jobId: `trend:${data.agencyId}:${data.clientId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  if (!job.id) throw new ExternalServiceError("Failed to enqueue trend job");
  return job.id;
}
