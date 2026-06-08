// Competitor queue producer. Routes enqueue; the worker (worker.ts) consumes.
// Deterministic jobId dedupes concurrent triggers for the same client.
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { CompetitorJobData } from "./competitor-job";

let queue: Queue<CompetitorJobData> | undefined;

function getCompetitorQueue(): Queue<CompetitorJobData> {
  queue ??= new Queue<CompetitorJobData>(QUEUE_NAMES.competitorSweep, {
    connection: redisConnection(),
  });
  return queue;
}

export async function enqueueCompetitor(data: CompetitorJobData): Promise<string> {
  const job = await getCompetitorQueue().add("competitor", data, {
    jobId: `competitor:${data.agencyId}:${data.clientId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  if (!job.id) throw new ExternalServiceError("Failed to enqueue competitor job");
  return job.id;
}
