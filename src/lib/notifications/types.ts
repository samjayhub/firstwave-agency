// Notifications & alerts (P4-06). Three event kinds the roadmap names:
//  - approval_requested: an item entered review and needs a human decision
//  - publish_failed: a publish job exhausted its retries (dead-letter)
//  - metric_milestone: a published post crossed a performance threshold
export type NotificationKind =
  | "approval_requested"
  | "publish_failed"
  | "metric_milestone";

export const NOTIFICATION_KINDS: NotificationKind[] = [
  "approval_requested",
  "publish_failed",
  "metric_milestone",
];

/** An event raised by the app; the service records + fans it out. */
export interface NotificationEvent {
  agencyId: string;
  kind: NotificationKind;
  title: string;
  body: string;
}

/** A persisted in-app notification (the feed + system of record). */
export interface StoredNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  readAt: Date | null;
  createdAt: Date;
}

/** Per-agency delivery settings. mutedKinds suppress EXTERNAL pings only. */
export interface NotificationSettings {
  agencyId: string;
  slackWebhookUrl: string | null;
  emailTo: string | null;
  mutedKinds: NotificationKind[];
}

export interface NotificationSettingsPatch {
  slackWebhookUrl?: string | null;
  emailTo?: string | null;
  mutedKinds?: NotificationKind[];
}

/**
 * Persistence for notifications + settings, tenant-scoped. Implementations:
 * in-memory fake, Prisma.
 */
export interface NotificationStore {
  save(event: NotificationEvent): Promise<StoredNotification>;
  list(agencyId: string, limit: number): Promise<StoredNotification[]>;
  /** Mark one notification read; false if not found / wrong tenant. */
  markRead(agencyId: string, id: string): Promise<boolean>;
  getSettings(agencyId: string): Promise<NotificationSettings | null>;
  upsertSettings(
    agencyId: string,
    patch: NotificationSettingsPatch,
  ): Promise<NotificationSettings>;
}

/**
 * An external delivery channel (Slack, email). `target` is the channel-specific
 * address (a webhook URL, an email recipient). Implementations should be
 * best-effort; the service tolerates a send throwing.
 */
export interface Notifier {
  channel: "slack" | "email";
  send(target: string, event: NotificationEvent): Promise<void>;
}
