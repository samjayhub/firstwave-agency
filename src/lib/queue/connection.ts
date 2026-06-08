// BullMQ connection options derived from REDIS_URL. We hand BullMQ plain options
// (it manages its own ioredis client) rather than sharing an instance — that
// avoids the dual-ioredis type clash and keeps one connection per queue/worker.
// `maxRetriesPerRequest: null` is required by BullMQ workers.
import type { ConnectionOptions } from "bullmq";
import { requireEnv } from "@/lib/config/env";

export function redisConnection(): ConnectionOptions {
  const url = new URL(requireEnv("REDIS_URL"));
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    ...(url.username ? { username: url.username } : {}),
    ...(url.password ? { password: url.password } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null,
  };
}
