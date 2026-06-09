import type { DeliverableWebhook, WebhookEvent, WebhookRow, WebhookStore } from "./index";

export class FakeWebhookStore implements WebhookStore {
  rows: WebhookRow[] = [];
  secrets = new Map<string, string>();
  private seq = 0;

  async create(
    agencyId: string,
    data: { url: string; secret: string; events: WebhookEvent[] },
  ) {
    this.seq += 1;
    const row: WebhookRow = {
      id: `wh-${this.seq}`,
      agencyId,
      url: data.url,
      events: data.events,
      active: true,
      createdAt: new Date("2026-06-09T00:00:00Z"),
    };
    this.secrets.set(row.id, data.secret);
    this.rows.push(row);
    return row;
  }

  async list(agencyId: string) {
    return this.rows.filter((r) => r.agencyId === agencyId);
  }

  async remove(agencyId: string, id: string) {
    const i = this.rows.findIndex((r) => r.id === id && r.agencyId === agencyId);
    if (i < 0) return false;
    this.rows.splice(i, 1);
    return true;
  }

  async deliverablesFor(agencyId: string, event: WebhookEvent): Promise<DeliverableWebhook[]> {
    return this.rows
      .filter((r) => r.agencyId === agencyId && r.active && r.events.includes(event))
      .map((r) => ({ id: r.id, url: r.url, secret: this.secrets.get(r.id)! }));
  }
}
