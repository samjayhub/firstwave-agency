// LinkedIn publisher adapter (candidate MVP platform).
// Phase 0: stub. Implement against the LinkedIn Posts API in Phase 1.

import type {
  Publisher,
  ConnectInput,
  ConnectedAccountRef,
  PublishInput,
  PublishResult,
  PostRef,
  AnalyticsSnapshotData,
} from "./types";

export class LinkedInPublisher implements Publisher {
  readonly platform = "linkedin" as const;

  async connect(_input: ConnectInput): Promise<ConnectedAccountRef> {
    // TODO(phase-1): exchange OAuth code → access/refresh token; store encrypted.
    throw new Error("not implemented");
  }

  async publish(_input: PublishInput): Promise<PublishResult> {
    // TODO(phase-1): POST to LinkedIn Posts API (only when item is approved).
    throw new Error("not implemented");
  }

  async fetchMetrics(_ref: PostRef): Promise<AnalyticsSnapshotData> {
    // TODO(phase-1): read post analytics for the feedback loop.
    throw new Error("not implemented");
  }
}
