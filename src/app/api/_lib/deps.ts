// Request-scoped wiring: build services/repositories from the real Prisma client
// and validated env. Kept out of the route files so handlers stay thin.
import { getPrisma } from "@/lib/db/prisma";
import { requireEnv } from "@/lib/config/env";
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
  prismaPerformanceStore,
  prismaSchedulerStore,
  prismaTeamStore,
} from "@/lib/repositories/prisma-stores";
import { PerformanceService } from "@/lib/performance";
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

export function approvalService(): ApprovalService {
  return new ApprovalService(prismaApprovalStore(getPrisma()));
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
