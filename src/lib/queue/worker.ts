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
  prismaAnalyticsStore,
  prismaApprovalStore,
  prismaClientStore,
  prismaCompetitorStore,
  prismaConnectedAccountRepository,
  prismaPublishJobStore,
  prismaResearchBriefStore,
  prismaTrendStore,
} from "@/lib/repositories/prisma-stores";
import { getPublisher } from "@/lib/publishers";
import { isRetryable, runPublishJob, type PublishJobData } from "@/lib/publish/job";
import { runResearchJob, type ResearchJobData } from "./research-job";
import { runCompetitorJob, type CompetitorJobData } from "./competitor-job";
import { runTrendJob, type TrendJobData } from "./trend-job";
import { runVideoJob, type VideoJobData } from "./video-job";
import { runFetchMetricsJob, type FetchMetricsJobData } from "./fetch-metrics-job";
import { runSchedulerJob, type SchedulerTickJobData } from "./scheduler-job";
import { registerSchedulerTick } from "./scheduler-queue";
import { enqueuePublish } from "./publish-queue";
import { SchedulerService } from "@/lib/scheduler";
import { prismaSchedulerStore } from "@/lib/repositories/prisma-stores";
import { ResearchService } from "@/lib/research";
import { CompetitorService } from "@/lib/competitor";
import { AnalyticsService } from "@/lib/analytics";
import {
  VideoStudioService,
  getBrollProvider,
  getTtsProvider,
  getVideoAssembler,
} from "@/lib/video";
import {
  prismaAssetRepository,
  prismaBrandProfileStore,
  prismaContentItemStore,
} from "@/lib/repositories/prisma-stores";
import { getAssetStorage } from "@/lib/creative";
import { youtubeCompetitorSource } from "@/lib/competitor/youtube";
import { TrendService } from "@/lib/trend";
import { googleTrendsSource } from "@/lib/trend/google-trends";
import { youtubeTrendingSource } from "@/lib/trend/youtube-trending";
import { tiktokCreativeCenterSource } from "@/lib/trend/tiktok-creative-center";
import { combineSources } from "@/lib/trend/combine";
import { getEnv } from "@/lib/config/env";
import { NotificationService } from "@/lib/notifications";
import { slackNotifier, httpEmailNotifier } from "@/lib/notifications/channels";
import type { Notifier } from "@/lib/notifications/types";
import { prismaNotificationStore, prismaReportStore } from "@/lib/repositories/prisma-stores";
import { ReportService } from "@/lib/reporting";
import { httpReportSender, logReportSender } from "@/lib/reporting/sender";
import { registerReportDigest, type ReportDigestJobData } from "./report-digest-queue";
import { registerMediaRetention } from "./media-retention-queue";
import { runMediaRetentionJob, type MediaRetentionJobData } from "./media-retention-job";
import { MediaLibraryService } from "@/lib/media";
import { prismaMediaStore } from "@/lib/repositories/prisma-stores";
import { prismaBrandingStore, prismaWebhookStore } from "@/lib/repositories/prisma-stores";
import { WebhookService, type WebhookEvent } from "@/lib/webhooks";
import { ClientRepository } from "@/lib/repositories/client-repository";
import { PrismaAuditSink } from "@/lib/db/audit-sink";
import { getLlmProvider, DEFAULT_LLM_MODEL } from "@/lib/llm";
import { requireEnv } from "@/lib/config/env";
import { assertPublicUrl } from "@/lib/brand-intel/url-guard";

export { QUEUE_NAMES } from "./names";

function buildNotificationService(): NotificationService {
  const env = getEnv();
  const channels: Notifier[] = [slackNotifier()];
  if (env.NOTIFY_EMAIL_ENDPOINT) {
    channels.push(
      httpEmailNotifier({
        endpoint: env.NOTIFY_EMAIL_ENDPOINT,
        ...(env.NOTIFY_EMAIL_TOKEN ? { token: env.NOTIFY_EMAIL_TOKEN } : {}),
      }),
    );
  }
  return new NotificationService({ store: prismaNotificationStore(getPrisma()), notifiers: channels });
}

const notifications = buildNotificationService();
const webhooks = new WebhookService({ store: prismaWebhookStore(getPrisma()) });

/** Best-effort webhook fan-out — a delivery failure must never crash a job. */
async function safeDispatch(
  agencyId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    await webhooks.dispatch(agencyId, event, data);
  } catch (err) {
    logger.error("webhook dispatch failed", {
      event,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Best-effort alert — a notification failure must never crash a worker job. */
async function safeNotify(event: Parameters<NotificationService["emit"]>[0]): Promise<void> {
  try {
    await notifications.emit(event);
  } catch (err) {
    logger.error("notification emit failed", {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}

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
  worker.on("completed", async (job) => {
    logger.info("publish job completed", { jobId: job.id });
    // Webhook fan-out: a post went live (P4-08).
    await safeDispatch(job.data.agencyId, "publish.succeeded", { itemId: job.data.itemId });
  });
  worker.on("failed", async (job, err) => {
    logger.error("publish job failed", { jobId: job?.id, message: err.message });
    // Dead-letter alert + webhook: only on the FINAL attempt (P4-06/P4-08).
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      await safeNotify({
        agencyId: job.data.agencyId,
        kind: "publish_failed",
        title: "Publishing failed",
        body: `A post for item ${job.data.itemId} failed after all retries: ${err.message}`,
      });
      await safeDispatch(job.data.agencyId, "publish.failed", {
        itemId: job.data.itemId,
        error: err.message,
      });
    }
  });
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

function startTrendWorker(): Worker<TrendJobData> {
  const prisma = getPrisma();
  // Trend Engine v2 (P4-05): fan in Google Trends + TikTok Creative Center, plus
  // YouTube trending when the (free) Data API key is configured. combineSources
  // tolerates any single source failing, so the sweep degrades gracefully.
  const youtubeKey = getEnv().YOUTUBE_API_KEY;
  const sources = [
    googleTrendsSource(),
    tiktokCreativeCenterSource(),
    ...(youtubeKey ? [youtubeTrendingSource({ apiKey: youtubeKey })] : []),
  ];
  const trend = new TrendService({
    llm: getLlmProvider(),
    sink: new PrismaAuditSink(prisma),
    model: DEFAULT_LLM_MODEL,
    store: prismaTrendStore(prisma),
    clients: new ClientRepository(prismaClientStore(prisma)),
    source: combineSources(...sources),
  });

  const worker = new Worker<TrendJobData>(
    QUEUE_NAMES.trendSweep,
    async (job) => runTrendJob({ trend }, job.data),
    { connection: redisConnection() },
  );
  worker.on("completed", (job) =>
    logger.info("trend job completed", { jobId: job.id }),
  );
  worker.on("failed", (job, err) =>
    logger.error("trend job failed", { jobId: job?.id, message: err.message }),
  );
  return worker;
}

function startVideoWorker(): Worker<VideoJobData> {
  const prisma = getPrisma();
  const video = new VideoStudioService({
    llm: getLlmProvider(),
    model: DEFAULT_LLM_MODEL,
    tts: getTtsProvider(),
    broll: getBrollProvider(),
    assembler: getVideoAssembler(),
    storage: getAssetStorage(),
    assets: prismaAssetRepository(prisma),
    items: prismaContentItemStore(prisma),
    brandProfiles: prismaBrandProfileStore(prisma),
    sink: new PrismaAuditSink(prisma),
  });

  const worker = new Worker<VideoJobData>(
    QUEUE_NAMES.produceVideo,
    async (job) => runVideoJob({ video }, job.data),
    { connection: redisConnection() },
  );
  worker.on("completed", (job) =>
    logger.info("video job completed", { jobId: job.id }),
  );
  worker.on("failed", (job, err) =>
    logger.error("video job failed", { jobId: job?.id, message: err.message }),
  );
  return worker;
}

function startMetricsWorker(): Worker<FetchMetricsJobData> {
  const prisma = getPrisma();
  const analytics = new AnalyticsService({
    store: prismaAnalyticsStore(prisma),
    resolvePublisher: getPublisher,
  });

  const worker = new Worker<FetchMetricsJobData>(
    QUEUE_NAMES.fetchMetrics,
    async (job) => {
      try {
        const snapshot = await runFetchMetricsJob({ analytics }, job.data);
        // Webhook fan-out: fresh metrics for a post (P4-08).
        await safeDispatch(job.data.agencyId, "metric.snapshot", {
          publishJobId: job.data.publishJobId,
          metrics: snapshot.metrics,
        });
        // Milestone alert: impressions crossed the configured threshold (P4-06).
        const impressions = snapshot.metrics.impressions ?? 0;
        const threshold = getEnv().NOTIFY_MILESTONE_IMPRESSIONS;
        if (impressions >= threshold) {
          await safeNotify({
            agencyId: job.data.agencyId,
            kind: "metric_milestone",
            title: "Performance milestone",
            body: `A post passed ${threshold.toLocaleString()} impressions (now ${impressions.toLocaleString()}).`,
          });
        }
        return snapshot;
      } catch (err) {
        // Terminal (not-found/validation) errors must not consume retries.
        if (err instanceof AppError && !isRetryable(err)) {
          throw new UnrecoverableError(err.message);
        }
        throw err;
      }
    },
    { connection: redisConnection() },
  );
  worker.on("completed", (job) =>
    logger.info("fetch-metrics job completed", { jobId: job.id }),
  );
  worker.on("failed", (job, err) =>
    logger.error("fetch-metrics job failed", { jobId: job?.id, message: err.message }),
  );
  return worker;
}

function startSchedulerWorker(): Worker<SchedulerTickJobData> {
  const prisma = getPrisma();
  const scheduler = new SchedulerService({
    store: prismaSchedulerStore(prisma),
    enqueue: enqueuePublish,
  });

  const worker = new Worker<SchedulerTickJobData>(
    QUEUE_NAMES.schedulerTick,
    async (job) => runSchedulerJob({ scheduler }, job.data),
    { connection: redisConnection() },
  );
  worker.on("completed", (job) =>
    logger.info("scheduler tick completed", {
      jobId: job.id,
      scheduled: job.returnvalue?.scheduled,
    }),
  );
  worker.on("failed", (job, err) =>
    logger.error("scheduler tick failed", { jobId: job?.id, message: err.message }),
  );
  return worker;
}

function startReportDigestWorker(): Worker<ReportDigestJobData> {
  const prisma = getPrisma();
  const env = getEnv();
  const sendEmail = env.NOTIFY_EMAIL_ENDPOINT
    ? httpReportSender({
        endpoint: env.NOTIFY_EMAIL_ENDPOINT,
        ...(env.NOTIFY_EMAIL_TOKEN ? { token: env.NOTIFY_EMAIL_TOKEN } : {}),
      })
    : logReportSender;
  const reports = new ReportService({
    store: prismaReportStore(prisma),
    branding: prismaBrandingStore(prisma),
    clients: new ClientRepository(prismaClientStore(prisma)),
    sendEmail,
  });

  const worker = new Worker<ReportDigestJobData>(
    QUEUE_NAMES.reportDigest,
    async () => reports.runDigest(getEnv().REPORT_PERIOD_DAYS),
    { connection: redisConnection() },
  );
  worker.on("completed", (job) =>
    logger.info("report digest completed", { jobId: job.id, sent: job.returnvalue?.sent }),
  );
  worker.on("failed", (job, err) =>
    logger.error("report digest failed", { jobId: job?.id, message: err.message }),
  );
  return worker;
}

function startMediaRetentionWorker(): Worker<MediaRetentionJobData> {
  const env = getEnv();
  const media = new MediaLibraryService({
    store: prismaMediaStore(getPrisma()),
    storage: getAssetStorage(),
  });
  const purgeDays = env.MEDIA_PURGE_DAYS > 0 ? env.MEDIA_PURGE_DAYS : null;

  const worker = new Worker<MediaRetentionJobData>(
    QUEUE_NAMES.mediaRetention,
    async (job) => runMediaRetentionJob({ media, retentionDays: env.MEDIA_RETENTION_DAYS, purgeDays }, job.data),
    { connection: redisConnection() },
  );
  worker.on("completed", (job) =>
    logger.info("media retention completed", {
      jobId: job.id,
      archived: job.returnvalue?.archived,
      purged: job.returnvalue?.purged,
    }),
  );
  worker.on("failed", (job, err) =>
    logger.error("media retention failed", { jobId: job?.id, message: err.message }),
  );
  return worker;
}

async function main() {
  startPublishWorker();
  startResearchWorker();
  startCompetitorWorker();
  startTrendWorker();
  startVideoWorker();
  startMetricsWorker();
  startSchedulerWorker();
  startReportDigestWorker();
  startMediaRetentionWorker();
  // Install the repeatable heartbeats (P4-01 auto-publish, P4-07 report digest,
  // P4-10 media retention).
  await registerSchedulerTick();
  const digestOn = await registerReportDigest();
  const retentionOn = await registerMediaRetention();
  logger.info("worker started", {
    queues: [
      QUEUE_NAMES.publish,
      QUEUE_NAMES.researchSweep,
      QUEUE_NAMES.competitorSweep,
      QUEUE_NAMES.trendSweep,
      QUEUE_NAMES.produceVideo,
      QUEUE_NAMES.fetchMetrics,
      QUEUE_NAMES.schedulerTick,
      ...(digestOn ? [QUEUE_NAMES.reportDigest] : []),
      ...(retentionOn ? [QUEUE_NAMES.mediaRetention] : []),
    ],
  });
}

void main();
