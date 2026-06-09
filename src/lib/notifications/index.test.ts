import { describe, expect, it } from "vitest";
import { NotificationService } from "./index";
import { FakeNotificationStore, RecordingNotifier } from "./fakes";
import type { NotificationEvent } from "./types";

const CTX = { agencyId: "ag1" };
const event = (over: Partial<NotificationEvent> = {}): NotificationEvent => ({
  agencyId: "ag1",
  kind: "approval_requested",
  title: "t",
  body: "b",
  ...over,
});

function setup() {
  const store = new FakeNotificationStore();
  const slack = new RecordingNotifier("slack");
  const email = new RecordingNotifier("email");
  const service = new NotificationService({ store, notifiers: [slack, email] });
  return { store, slack, email, service };
}

describe("NotificationService.emit", () => {
  it("always records the in-app notification", async () => {
    const { service, store } = setup();
    const stored = await service.emit(event());
    expect(stored.id).toBeTruthy();
    expect(await store.list("ag1", 50)).toHaveLength(1);
  });

  it("does not dispatch externally when no targets are configured", async () => {
    const { service, slack, email } = setup();
    await service.emit(event());
    expect(slack.sent).toHaveLength(0);
    expect(email.sent).toHaveLength(0);
  });

  it("dispatches to the channels whose targets are set", async () => {
    const { service, store, slack, email } = setup();
    await store.upsertSettings("ag1", { slackWebhookUrl: "https://hooks/x" });
    await service.emit(event());
    expect(slack.sent).toHaveLength(1);
    expect(slack.sent[0]!.target).toBe("https://hooks/x");
    expect(email.sent).toHaveLength(0); // emailTo not set
  });

  it("suppresses external pings for a muted kind but still records in-app", async () => {
    const { service, store, slack } = setup();
    await store.upsertSettings("ag1", {
      slackWebhookUrl: "https://hooks/x",
      mutedKinds: ["approval_requested"],
    });
    await service.emit(event({ kind: "approval_requested" }));
    expect(slack.sent).toHaveLength(0);
    expect(await store.list("ag1", 50)).toHaveLength(1);
  });

  it("tolerates a channel that throws", async () => {
    const store = new FakeNotificationStore();
    await store.upsertSettings("ag1", { slackWebhookUrl: "https://hooks/x" });
    const flaky = new RecordingNotifier("slack", true); // throws once
    const service = new NotificationService({ store, notifiers: [flaky] });
    await expect(service.emit(event())).resolves.toBeTruthy(); // no throw
  });
});

describe("NotificationService feed + settings", () => {
  it("lists newest-first and marks read", async () => {
    const { service, store } = setup();
    const first = await service.emit(event({ title: "first" }));
    await service.emit(event({ title: "second" }));
    const list = await service.list(CTX);
    expect(list[0]!.title).toBe("second");

    expect(await service.markRead(CTX, first.id)).toBe(true);
    expect(await service.markRead(CTX, first.id)).toBe(false); // already read
    expect(await store.list("ag1", 50)).toHaveLength(2);
  });

  it("returns default settings when none saved, then round-trips a patch", async () => {
    const { service } = setup();
    expect(await service.getSettings(CTX)).toMatchObject({ mutedKinds: [], emailTo: null });
    const updated = await service.updateSettings(CTX, { emailTo: "ops@acme.com" });
    expect(updated.emailTo).toBe("ops@acme.com");
  });
});
