// BullMQ worker entrypoint. Every long-running module (brand extraction,
// competitor sweep, generation, publish) runs as a retryable job here.
// Phase 0: stub — no processors registered yet. See docs/02-architecture.md §1.

// import { Worker } from "bullmq";

export const QUEUE_NAMES = {
  brandExtract: "brand-extract",
  competitorSweep: "competitor-sweep",
  trendSweep: "trend-sweep",
  contentPlan: "content-plan",
  generateCreative: "generate-creative",
  publish: "publish",
  fetchMetrics: "fetch-metrics",
} as const;

// TODO(phase-1): instantiate Worker(s) bound to REDIS_URL and register
// processors that call the corresponding lib/<module> functions.

function main() {
  // eslint-disable-next-line no-console
  console.log("worker: no processors registered (Phase 0 scaffold).");
}

main();
