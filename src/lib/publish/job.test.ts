import { describe, it, expect } from "vitest";
import { runPublishJob, type PublishJobDeps } from "./job";
import {
  FakeApprovalStore,
  FakeConnectedAccountRepository,
  FakePublishJobStore,
} from "@/lib/repositories/fakes/fake-publish-stores";
import type { Publisher } from "@/lib/publishers/types";
import type { StoredCopy } from "@/lib/content/types";
import type { ItemStatus } from "@/lib/approval";

const STORED: StoredCopy = {
  platform: "linkedin",
  brief: { day: 1, platform: "linkedin", pillar: "edu", format: "text", idea: "Tip" },
  generated: { caption: "Hello world", hook: "h", hashtags: [], description: "d" },
};

function publisher(overrides: Partial<Publisher> = {}): Publisher {
  return {
    platform: "linkedin",
    authorizeUrl: () => "",
    exchangeCode: async () => ({ externalId: "x", accessToken: "t" }),
    publish: async () => ({ externalId: "urn:li:share:1", permalink: "p" }),
    fetchMetrics: async () => ({ capturedAt: new Date(0) }),
    ...overrides,
  };
}

async function setup(opts: { status?: ItemStatus; copy?: unknown } = {}) {
  const approval = new FakeApprovalStore();
  approval.seed({
    id: "item_1",
    agencyId: "ag1",
    clientId: "cl1",
    status: opts.status ?? "scheduled",
    scheduledAt: null,
    copy: "copy" in opts ? opts.copy : STORED,
  });
  const accounts = new FakeConnectedAccountRepository();
  const { id: connectedAccountId } = await accounts.create("ag1", {
    clientId: "cl1",
    platform: "linkedin",
    externalId: "urn:li:person:abc",
    accessTokenEnc: "ENCRYPTED",
  });
  const jobs = new FakePublishJobStore();
  return { approval, accounts, jobs, connectedAccountId };
}

const data = (connectedAccountId: string) => ({
  agencyId: "ag1",
  itemId: "item_1",
  connectedAccountId,
});

describe("runPublishJob", () => {
  it("publishes a scheduled item, records the job, and marks it published", async () => {
    const { approval, accounts, jobs, connectedAccountId } = await setup();
    const deps: PublishJobDeps = {
      approval,
      accounts,
      jobs,
      resolvePublisher: () => publisher(),
      decrypt: (s) => s,
    };
    const out = await runPublishJob(deps, data(connectedAccountId));
    expect(out.state).toBe("published");
    expect(out.externalId).toBe("urn:li:share:1");
    expect(jobs.jobs[0]!.state).toBe("published");
    expect((await approval.get("ag1", "item_1"))!.status).toBe("published");
  });

  it("decrypts the stored token before handing it to the publisher", async () => {
    const { approval, accounts, jobs, connectedAccountId } = await setup();
    let usedToken = "";
    const deps: PublishJobDeps = {
      approval,
      accounts,
      jobs,
      resolvePublisher: () =>
        publisher({
          publish: async (input) => {
            usedToken = input.accessToken;
            return { externalId: "id" };
          },
        }),
      decrypt: (s) => `decrypted(${s})`,
    };
    await runPublishJob(deps, data(connectedAccountId));
    expect(usedToken).toBe("decrypted(ENCRYPTED)");
  });

  it("enforces the human gate: refuses an item that is not scheduled", async () => {
    const { approval, accounts, jobs, connectedAccountId } = await setup({ status: "approved" });
    const deps: PublishJobDeps = {
      approval,
      accounts,
      jobs,
      resolvePublisher: () => publisher(),
      decrypt: (s) => s,
    };
    await expect(runPublishJob(deps, data(connectedAccountId))).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(jobs.jobs[0]!.state).toBe("failed");
  });

  it("marks the job failed and moves the item to failed when the publisher throws", async () => {
    const { approval, accounts, jobs, connectedAccountId } = await setup();
    const deps: PublishJobDeps = {
      approval,
      accounts,
      jobs,
      resolvePublisher: () =>
        publisher({
          publish: async () => {
            throw new Error("LinkedIn 500 with Bearer sk-leak");
          },
        }),
      decrypt: (s) => s,
    };
    await expect(runPublishJob(deps, data(connectedAccountId))).rejects.toThrow();
    expect(jobs.jobs[0]!.state).toBe("failed");
    expect(jobs.jobs[0]!.error).not.toContain("sk-leak"); // scrubbed
    expect((await approval.get("ag1", "item_1"))!.status).toBe("failed");
  });

  it("refuses a connected account in another agency", async () => {
    const { approval, jobs } = await setup();
    const accounts = new FakeConnectedAccountRepository(); // empty
    const deps: PublishJobDeps = {
      approval,
      accounts,
      jobs,
      resolvePublisher: () => publisher(),
      decrypt: (s) => s,
    };
    await expect(runPublishJob(deps, data("nope"))).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
