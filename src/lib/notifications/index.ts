// Notification service (P4-06). Records every event to the in-app feed (the
// system of record) and fans non-muted events out to whichever external channels
// the agency has configured (Slack webhook, email). External delivery is
// best-effort: a channel throwing is logged and never fails the emit, and never
// blocks the caller's primary action (approval, publish, metrics refresh).
//
// AUDIT-EXEMPT: rule-based dispatch, not a generative action; the Notification
// rows are the trail.
import type { TenantContext } from "@/lib/db/tenancy";
import { logger } from "@/lib/logger";
import type {
  NotificationEvent,
  NotificationSettings,
  NotificationSettingsPatch,
  NotificationStore,
  Notifier,
  StoredNotification,
} from "./types";

export * from "./types";

const DEFAULT_LIST_LIMIT = 50;

export interface NotificationServiceDeps {
  store: NotificationStore;
  /** External channels available; each fires only if the agency configured it. */
  notifiers?: Notifier[];
}

export class NotificationService {
  private readonly notifiers: Notifier[];

  constructor(private readonly deps: NotificationServiceDeps) {
    this.notifiers = deps.notifiers ?? [];
  }

  /** Record an event + fan it out. Never throws for channel failures. */
  async emit(event: NotificationEvent): Promise<StoredNotification> {
    const stored = await this.deps.store.save(event);

    const settings = await this.deps.store.getSettings(event.agencyId);
    if (settings && !settings.mutedKinds.includes(event.kind)) {
      await this.dispatch(event, settings);
    }
    return stored;
  }

  private async dispatch(
    event: NotificationEvent,
    settings: NotificationSettings,
  ): Promise<void> {
    const targets: Record<Notifier["channel"], string | null> = {
      slack: settings.slackWebhookUrl,
      email: settings.emailTo,
    };
    await Promise.all(
      this.notifiers.map(async (notifier) => {
        const target = targets[notifier.channel];
        if (!target) return;
        try {
          await notifier.send(target, event);
        } catch (err) {
          logger.warn("notification channel failed", {
            channel: notifier.channel,
            kind: event.kind,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }

  list(ctx: TenantContext, limit = DEFAULT_LIST_LIMIT): Promise<StoredNotification[]> {
    return this.deps.store.list(ctx.agencyId, limit);
  }

  markRead(ctx: TenantContext, id: string): Promise<boolean> {
    return this.deps.store.markRead(ctx.agencyId, id);
  }

  async getSettings(ctx: TenantContext): Promise<NotificationSettings> {
    const s = await this.deps.store.getSettings(ctx.agencyId);
    return (
      s ?? { agencyId: ctx.agencyId, slackWebhookUrl: null, emailTo: null, mutedKinds: [] }
    );
  }

  updateSettings(
    ctx: TenantContext,
    patch: NotificationSettingsPatch,
  ): Promise<NotificationSettings> {
    return this.deps.store.upsertSettings(ctx.agencyId, patch);
  }
}
