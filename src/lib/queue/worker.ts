// BullMQ worker entrypoint (run with `npm run worker`). Registers processors for
// the long-running / retryable jobs. Phase 1 wires the publish queue; Phase 2
// adds research, competitor, trend, and analytics workers.
import { UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors/app-error";
import { getPrisma } from "@/lib/db/prisma";
import {
  prismaApprovalStore,
  prismaClientStore,
  prismaCompetitorStore,
  prismaConnectedAccountRepository,
  prismaPublishJobStore,
  prismaResearchBriefStore,
} from "@/lib/repositories/prisma-stores";
import { getPublisher } from "@/lib/publishers";
import { isRetryable, runPublishJob, type PublishJobData } from "@/lib/publish/job";
import { runResearchJob, type ResearchJobData } from "./research-job";
import { runCompetitorJob, type CompetitorJobData } from "./competitor-job";
import { ResearchService } from "@/lib/research";
import { CompetitorService } from "@/lib/competitor";
import { youtubeCompetitorSource } from "@/lib/competitor/youtube";
import { ClientRepository } from "@/lib/repositories/client-repository";
import { PrismaAuditSink } from "@/lib/db/audit-sink";
import { getLlmProvider, DEFAULT_LLM_MODEL } from "@/lib/llm";
import { requireEnv } from "@/lib/config/env";
import { assertPublicUrl } from "@/lib/brand-intel/url-guard";

export { QUEUE_NAMES } from "./names";

function startPublishWorker(): Worker<PublishJobData> {
  const prisma = getPrisma();
  const deps = {
    approval: prismaApprovalStore(prisma),
    accounts: prismaConnectedAccountRepository(prisma),
    jobs: prismaPublishJobStore(prisma),
    resolvePublisher: getPublisher,
  };
  const worker = new Worker<PublishJobData>(
    QUEUE_NAMES.publish,
    async (job) => {
      const finalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      try {
        return await runPublishJob(deps, job.data, { finalAttempt });
      } catch (err) {
        // Terminal (config/validation) errors must not consume retries.
        if (err instanceof AppError && !isRetryable(err)) {
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    },
    { connection: redisConnection() },
  );
  worker.on("completed", (job) => logger.info("publish job completed", { jobId: job.id }));
  worker.on("failed", (job, err) =>
    logger.error("publish job failed", { jobId: job?.id, message: err.message }),
  );
  return worker;
}

function startResearchWorker(): Worker<ResearchJobData> {
  const prisma = getPrisma();
  const research = new ResearchService({
    llm: getLlmProvider(),
    sink: new PrismaAuditSink(prisma),
    model: DEFAULT_LLM_MODEL,
    store: prismaResearchBriefStore(prisma),
    clients: new ClientRepository(prismaClientStore(prisma)),
    fetchUrl: async (url) => {
      await assertPublicUrl(url);
      const res = await fetch(url, {
        headers: { "User-Agent": "firstwave-research/1.0" },
        signal: AbortSignal.timeout(10_000),
      });
      return res.text();
    },
  });

  const worker = new Worker<ResearchJobData>(
    QUEUE_NAMES.researchSweep,
    async (job) => runResearchJob({ research }, job.data),
    { connection: redisConnection() },
  );
  worker.on("completed", (job) =>
    logger.info("research job completed", { jobId: job.id }),
  );
  worker.on("failed", (job, err) =>
    logger.error("research job failed", { jobId: job?.id, message: err.message }),
  );
  return worker;
}

function startCompetitorWorker(): Worker<CompetitorJobData> {
  const prisma = getPrisma();
  const competitor = new CompetitorService({
    llm: getLlmProvider(),
    sink: new PrismaAuditSink(prisma),
    model: DEFAULT_LLM_MODEL,
    store: prismaCompetitorStore(prisma),
    clients: new ClientRepository(prismaClientStore(prisma)),
    source: youtubeCompetitorSource(requireEnv("YOUTUBE_API_KEY")),
  });

  const worker = new Worker<CompetitorJobData>(
    QUEUE_NAMES.competitorSweep,
    async (job) => runCompetitorJob({ competitor }, job.data),
    { connection: redisConnection() },
  );
  worker.on("completed", (job) =>
    logger.info("competitor job completed", { jobId: job.id }),
  );
  worker.on("failed", (job, err) =>
    logger.error("competitor job failed", { jobId: job?.id, message: err.message }),
  );
  return worker;
}

function main() {
  startPublishWorker();
  startResearchWorker();
  startCompetitorWorker();
  logger.info("worker started", {
    queues: [QUEUE_NAMES.publish, QUEUE_NAMES.researchSweep, QUEUE_NAMES.competitorSweep],
  });
}

main();
