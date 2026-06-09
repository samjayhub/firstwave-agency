// Fetch-metrics queue producer. Routes enqueue; the worker (worker.ts) consumes.
// Deterministic jobId dedupes concurrent refreshes for the same publish job.
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { FetchMetricsJobData } from "./fetch-metrics-job";

let queue: Queue<FetchMetricsJobData> | undefined;

function getFetchMetricsQueue(): Queue<FetchMetricsJobData> {
  queue ??= new Queue<FetchMetricsJobData>(QUEUE_NAMES.fetchMetrics, {
    connection: redisConnection(),
  });
  return queue;
}

export async function enqueueFetchMetrics(data: FetchMetricsJobData): Promise<string> {
  const job = await getFetchMetricsQueue().add("fetch-metrics", data, {
    jobId: `metrics:${data.agencyId}:${data.publishJobId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  if (!job.id) throw new ExternalServiceError("Failed to enqueue fetch-metrics job");
  return job.id;
}
