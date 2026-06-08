// BullMQ worker entrypoint (run with `npm run worker`). Registers processors for
// the long-running / retryable jobs. Phase 1 wires the publish queue.
import { UnrecoverableError, Worker } from "bullmq";
import { redisConnection } from "./connection";
import { QUEUE_NAMES } from "./names";
import { logger } from "@/lib/logger";
import { AppError } from "@/lib/errors/app-error";
import { getPrisma } from "@/lib/db/prisma";
import {
  prismaApprovalStore,
  prismaConnectedAccountRepository,
  prismaPublishJobStore,
} from "@/lib/repositories/prisma-stores";
import { getPublisher } from "@/lib/publishers";
import { isRetryable, runPublishJob, type PublishJobData } from "@/lib/publish/job";

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

function main() {
  startPublishWorker();
  logger.info("worker started", { queues: [QUEUE_NAMES.publish] });
}

main();
