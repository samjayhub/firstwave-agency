// Request-scoped wiring: build services/repositories from the real Prisma client
// and validated env. Kept out of the route files so handlers stay thin.
import { randomBytes } from "node:crypto";
import { getPrisma } from "@/lib/db/prisma";
import { getEnv, requireEnv } from "@/lib/config/env";
import { AuthService } from "@/lib/auth/auth-service";
import { TeamService } from "@/lib/team";
import { requireAuth, type AuthContext } from "@/lib/auth/guard";
import { readSessionToken } from "@/lib/auth/session";
import { ClientRepository } from "@/lib/repositories/client-repository";
import {
  prismaAnalyticsStore,
  prismaApprovalStore,
  prismaAuthStore,
  prismaBillingStore,
  prismaBrandingStore,
  prismaClientStore,
  prismaConnectedAccountRepository,
  prismaApiKeyStore,
  prismaAssetRepository,
  prismaContentPlanStore,
  prismaNotificationStore,
  prismaPerformanceStore,
  prismaReportStore,
  prismaComplianceStore,
  prismaMediaStore,
  prismaReviewStore,
  prismaSchedulerStore,
  prismaTeamStore,
  prismaWebhookStore,
} from "@/lib/repositories/prisma-stores";
import { ComplianceService } from "@/lib/compliance";
import { MediaLibraryService } from "@/lib/media";
import { ApiKeyService } from "@/lib/api-keys";
import { WebhookService } from "@/lib/webhooks";
import { PerformanceService } from "@/lib/performance";
import { ReportService } from "@/lib/reporting";
import { httpReportSender, logReportSender } from "@/lib/reporting/sender";
import { ReviewService } from "@/lib/review";
import { NotificationService } from "@/lib/notifications";
import { slackNotifier, httpEmailNotifier } from "@/lib/notifications/channels";
import type { Notifier } from "@/lib/notifications/types";
import { SchedulerService } from "@/lib/scheduler";
import { enqueuePublish } from "@/lib/queue/publish-queue";
import { ApprovalService } from "@/lib/approval";
import { ConnectionService } from "@/lib/connections";
import { AnalyticsService } from "@/lib/analytics";
import { BillingService } from "@/lib/billing";
import { HttpStripeGateway } from "@/lib/billing/stripe-gateway";
import { WhiteLabelService } from "@/lib/whitelabel";
import { getPublisher } from "@/lib/publishers";

export function authService(): AuthService {
  return new AuthService({
    store: prismaAuthStore(getPrisma()),
    secret: requireEnv("JWT_SECRET"),
  });
}

export function teamService(): TeamService {
  return new TeamService({ store: prismaTeamStore(getPrisma()) });
}

export function clientRepository(): ClientRepository {
  return new ClientRepository(prismaClientStore(getPrisma()));
}

export function complianceService(): ComplianceService {
  return new ComplianceService({ store: prismaComplianceStore(getPrisma()) });
}

export function mediaLibraryService(): MediaLibraryService {
  return new MediaLibraryService({ store: prismaMediaStore(getPrisma()) });
}

export function approvalService(): ApprovalService {
  return new ApprovalService(prismaApprovalStore(getPrisma()), complianceService());
}

export function connectionService(): ConnectionService {
  return new ConnectionService({
    accounts: prismaConnectedAccountRepository(getPrisma()),
    resolvePublisher: getPublisher,
  });
}

export function connectedAccountsRepository() {
  return prismaConnectedAccountRepository(getPrisma());
}

export function billingService(): BillingService {
  return new BillingService({
    store: prismaBillingStore(getPrisma()),
    gateway: new HttpStripeGateway({
      secretKey: requireEnv("STRIPE_SECRET_KEY"),
      webhookSecret: requireEnv("STRIPE_WEBHOOK_SECRET"),
    }),
    prices: {
      starter: requireEnv("STRIPE_PRICE_STARTER"),
      pro: requireEnv("STRIPE_PRICE_PRO"),
    },
  });
}

export function whiteLabelService(): WhiteLabelService {
  return new WhiteLabelService({ store: prismaBrandingStore(getPrisma()) });
}

export function analyticsService(): AnalyticsService {
  return new AnalyticsService({
    store: prismaAnalyticsStore(getPrisma()),
    resolvePublisher: getPublisher,
  });
}

export function performanceService(): PerformanceService {
  return new PerformanceService({ store: prismaPerformanceStore(getPrisma()) });
}

/** Build the external notifier channels available given current config. */
function notificationChannels(): Notifier[] {
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
  return channels;
}

export function notificationService(): NotificationService {
  return new NotificationService({
    store: prismaNotificationStore(getPrisma()),
    notifiers: notificationChannels(),
  });
}

export function reportService(): ReportService {
  const env = getEnv();
  const sendEmail = env.NOTIFY_EMAIL_ENDPOINT
    ? httpReportSender({
        endpoint: env.NOTIFY_EMAIL_ENDPOINT,
        ...(env.NOTIFY_EMAIL_TOKEN ? { token: env.NOTIFY_EMAIL_TOKEN } : {}),
      })
    : logReportSender;
  return new ReportService({
    store: prismaReportStore(getPrisma()),
    branding: prismaBrandingStore(getPrisma()),
    clients: new ClientRepository(prismaClientStore(getPrisma())),
    sendEmail,
  });
}

export function apiKeyService(): ApiKeyService {
  return new ApiKeyService({ store: prismaApiKeyStore(getPrisma()) });
}

export function assetRepository() {
  return prismaAssetRepository(getPrisma());
}

export function contentPlanStore() {
  return prismaContentPlanStore(getPrisma());
}

export function webhookService(): WebhookService {
  return new WebhookService({ store: prismaWebhookStore(getPrisma()) });
}

export function reviewService(): ReviewService {
  return new ReviewService({
    store: prismaReviewStore(getPrisma()),
    branding: prismaBrandingStore(getPrisma()),
    generateToken: () => randomBytes(24).toString("hex"),
    baseUrl: getEnv().APP_BASE_URL,
    compliance: complianceService(),
  });
}

export function schedulerService(): SchedulerService {
  return new SchedulerService({
    store: prismaSchedulerStore(getPrisma()),
    enqueue: enqueuePublish,
  });
}

/** Authenticate the current request from its session cookie. */
export function requireRequestAuth(): AuthContext {
  return requireAuth(readSessionToken(), requireEnv("JWT_SECRET"));
}
