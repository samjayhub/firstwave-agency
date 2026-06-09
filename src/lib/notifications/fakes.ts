// In-memory NotificationStore + a recording Notifier for offline tests.
import type {
  NotificationEvent,
  NotificationSettings,
  NotificationSettingsPatch,
  NotificationStore,
  Notifier,
  StoredNotification,
} from "./types";

export class FakeNotificationStore implements NotificationStore {
  private agencies = new Map<string, StoredNotification[]>();
  private settingsByAgency = new Map<string, NotificationSettings>();
  private seq = 0;

  private byAgency(agencyId: string): StoredNotification[] {
    let arr = this.agencies.get(agencyId);
    if (!arr) {
      arr = [];
      this.agencies.set(agencyId, arr);
    }
    return arr;
  }

  async save(event: NotificationEvent): Promise<StoredNotification> {
    this.seq += 1;
    const stored: StoredNotification = {
      id: `n-${this.seq}`,
      kind: event.kind,
      title: event.title,
      body: event.body,
      readAt: null,
      createdAt: new Date("2026-06-09T00:00:00Z"),
    };
    this.byAgency(event.agencyId).push(stored);
    return stored;
  }

  async list(agencyId: string, limit: number): Promise<StoredNotification[]> {
    return [...this.byAgency(agencyId)].reverse().slice(0, limit);
  }

  async markRead(agencyId: string, id: string): Promise<boolean> {
    const n = this.byAgency(agencyId).find((x) => x.id === id);
    if (!n || n.readAt) return false;
    n.readAt = new Date("2026-06-09T01:00:00Z");
    return true;
  }

  async getSettings(agencyId: string): Promise<NotificationSettings | null> {
    return this.settingsByAgency.get(agencyId) ?? null;
  }

  async upsertSettings(
    agencyId: string,
    patch: NotificationSettingsPatch,
  ): Promise<NotificationSettings> {
    const current = this.settingsByAgency.get(agencyId) ?? {
      agencyId,
      slackWebhookUrl: null,
      emailTo: null,
      mutedKinds: [],
    };
    const next: NotificationSettings = { ...current, ...patch };
    this.settingsByAgency.set(agencyId, next);
    return next;
  }
}

export class RecordingNotifier implements Notifier {
  sent: Array<{ target: string; event: NotificationEvent }> = [];
  constructor(
    public channel: "slack" | "email" = "slack",
    private failOnce = false,
  ) {}

  async send(target: string, event: NotificationEvent): Promise<void> {
    if (this.failOnce) {
      this.failOnce = false;
      throw new Error("channel boom");
    }
    this.sent.push({ target, event });
  }
}
