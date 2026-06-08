// Publish job handler — the unit the BullMQ worker runs. Pure dependency
// injection so it is fully testable without Redis. Enforces the human-approval
// gate (item must be `scheduled`) and records the outcome on a PublishJob row.
//
// Retry semantics: the item stays `scheduled` between retries so the gate keeps
// passing; it is only moved to `failed` on the FINAL attempt (or on a terminal,
// non-retryable error). An already-`published` item short-circuits (idempotency).
//
// AUDIT-EXEMPT: publishing is a rule-based (non-LLM) action, so it is not written
// to ai_audit_log; the PublishJob row IS its audit trail.
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import { logger, scrubSecrets } from "@/lib/logger";
import { decryptToken } from "@/lib/crypto/tokens";
import type { ApprovalStore } from "@/lib/approval";
import type { ConnectedAccountRepository } from "@/lib/connections";
import type { Platform, Publisher } from "@/lib/publishers/types";
import type { StoredCopy } from "@/lib/content/types";

export type PublishState = "queued" | "posting" | "published" | "failed";

export interface PublishJobStore {
  create(input: {
    contentItemId: string;
    platform: Platform;
    state: PublishState;
  }): Promise<{ id: string }>;
  markResult(
    id: string,
    result: { state: "published" | "failed"; externalId?: string; error?: string },
  ): Promise<void>;
}

export interface PublishJobData {
  agencyId: string;
  itemId: string;
  connectedAccountId: string;
}

export interface PublishJobDeps {
  approval: ApprovalStore;
  accounts: ConnectedAccountRepository;
  jobs: PublishJobStore;
  resolvePublisher: (platform: Platform) => Publisher;
  decrypt?: (s: string) => string;
}

export interface PublishOutcome {
  state: "published" | "failed";
  externalId?: string;
  error?: string;
}

/** Only upstream/transient failures should be retried; config/validation are terminal. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof AppError) return err.code === "EXTERNAL_SERVICE" || err.code === "INTERNAL";
  return true; // unknown errors are treated as transient
}

export async function runPublishJob(
  deps: PublishJobDeps,
  data: PublishJobData,
  opts: { finalAttempt?: boolean } = {},
): Promise<PublishOutcome> {
  const finalAttempt = opts.finalAttempt ?? true;
  const decrypt = deps.decrypt ?? decryptToken;

  // Pre-flight (no side effects) so terminal misconfig doesn't spawn job rows.
  const account = await deps.accounts.getForAgency(data.agencyId, data.connectedAccountId);
  if (!account) throw new NotFoundError("Connected account not found");

  const item = await deps.approval.get(data.agencyId, data.itemId);
  if (!item) throw new NotFoundError("Content item not found");
  // Idempotency: never double-post an item that already went live.
  if (item.status === "published") return { state: "published" };

  const job = await deps.jobs.create({
    contentItemId: data.itemId,
    platform: account.platform,
    state: "posting",
  });

  try {
    // The account must belong to the SAME client as the item (privacy).
    if (item.clientId !== account.clientId) {
      throw new ValidationError("Connected account belongs to a different client");
    }
    // Human-approval gate: only an item that was approved → scheduled may publish.
    if (item.status !== "scheduled") {
      throw new ConflictError("Content item is not scheduled for publishing");
    }
    const caption = (item.copy as StoredCopy | null)?.generated?.caption;
    if (!caption) throw new ValidationError("Content item has no generated copy to publish");

    const result = await deps.resolvePublisher(account.platform).publish({
      accessToken: decrypt(account.accessTokenEnc),
      authorId: account.externalId,
      caption,
    });

    await deps.jobs.markResult(job.id, { state: "published", externalId: result.externalId });
    const moved = await deps.approval.transition(data.agencyId, data.itemId, "scheduled", "published");
    if (!moved) {
      // The post is live but the item moved out of `scheduled` concurrently — surface it.
      logger.warn("publish succeeded but item left scheduled before transition", {
        itemId: data.itemId,
        externalId: result.externalId,
      });
    }
    return { state: "published", externalId: result.externalId };
  } catch (err) {
    const message = scrubSecrets(err instanceof Error ? err.message : String(err)).slice(0, 500);
    await deps.jobs.markResult(job.id, { state: "failed", error: message });
    // Move the item to `failed` only when we won't retry — otherwise leave it
    // `scheduled` so the next attempt passes the gate.
    if (!isRetryable(err) || finalAttempt) {
      await deps.approval.transition(data.agencyId, data.itemId, "scheduled", "failed");
    }
    throw err;
  }
}
