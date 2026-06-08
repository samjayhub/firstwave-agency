// Queue names shared by the producers (routes) and the worker.
export const QUEUE_NAMES = {
  brandExtract: "brand-extract",
  competitorSweep: "competitor-sweep",
  trendSweep: "trend-sweep",
  contentPlan: "content-plan",
  generateCreative: "generate-creative",
  publish: "publish",
  fetchMetrics: "fetch-metrics",
} as const;
