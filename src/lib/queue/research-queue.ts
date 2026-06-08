// Research queue producer. Routes enqueue; the worker (worker.ts) consumes.
// Deterministic jobId dedupes concurrent triggers for the same client.
import { Queue } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { ResearchJobData } from "./research-job";

let queue: Queue<ResearchJobData> | undefined;

function getResearchQueue(): Queue<ResearchJobData> {
  queue ??= new Queue<ResearchJobData>(QUEUE_NAMES.researchSweep, {
    connection: redisConnection(),
  });
  return queue;
}

export async function enqueueResearch(data: ResearchJobData): Promise<string> {
  const job = await getResearchQueue().add("research", data, {
    jobId: `research:${data.agencyId}:${data.clientId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  });
  if (!job.id) throw new ExternalServiceError("Failed to enqueue research job");
  return job.id;
}
