// Tenant isolation. We use ROW-LEVEL scoping (every tenant-owned row carries an
// agencyId, directly or via its parent client) rather than schema-per-tenant.
//
// Adapted "3-step rule": any new tenant-scoped model must (1) ship in a
// migration, (2) be registered in TENANT_SCOPED_MODELS below, and (3) only be
// reached through a repository that injects the agency scope. Postgres RLS
// policies are a planned hardening layer on top of this app-level enforcement.

import { ValidationError } from "@/lib/errors/app-error";

/**
 * Registry of tenant-scoped models and how each is bound to an agency:
 *  - "direct": the row has its own agencyId column.
 *  - "via-client": the row is owned by a Client; scope through client.agencyId.
 *  - "via-plan" / "via-item" / "via-job": scope through the named ancestor.
 */
export const TENANT_SCOPED_MODELS = {
  User: "direct",
  Client: "direct",
  AiAuditLog: "direct",
  BrandProfile: "via-client",
  ConnectedAccount: "via-client",
  Competitor: "via-client",
  Trend: "via-client",
  ContentPlan: "via-client",
  ContentItem: "via-plan",
  Asset: "via-item",
  PublishJob: "via-item",
  AnalyticsSnapshot: "via-job",
} as const;

export type TenantScopedModel = keyof typeof TENANT_SCOPED_MODELS;

/** A validated tenant context. Carried from the JWT (PR3) into every repository. */
export interface TenantContext {
  agencyId: string;
}

export function assertAgencyId(agencyId: string | undefined | null): string {
  if (!agencyId || typeof agencyId !== "string") {
    throw new ValidationError("agencyId is required for a tenant-scoped operation");
  }
  return agencyId;
}

/** Merge an agency scope into a Prisma `where`. The scope is non-overridable. */
export function scopedWhere<W extends object>(
  agencyId: string,
  where?: W,
): W & { agencyId: string } {
  return { ...(where ?? ({} as W)), agencyId: assertAgencyId(agencyId) };
}
