import { logger as defaultLogger, scrubSecrets, type Logger } from "@/lib/logger";
import type { AiAuditRecord, AiAuditSink } from "./types";

export * from "./types";

const MAX_ERROR_LEN = 500;

/** Sanitize a captured exception message: scrub embedded secrets + truncate. */
function safeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return scrubSecrets(raw).slice(0, MAX_ERROR_LEN);
}

/** Keeps records in memory — used by tests and as a default no-DB fallback. */
export class InMemoryAuditSink implements AiAuditSink {
  readonly records: AiAuditRecord[] = [];
  async record(entry: AiAuditRecord): Promise<void> {
    this.records.push(entry);
  }
}

/** Writes audit records through the structured logger. */
export class LoggerAuditSink implements AiAuditSink {
  constructor(private readonly log: Logger = defaultLogger) {}
  async record(entry: AiAuditRecord): Promise<void> {
    this.log.info("ai_audit", { ...entry });
  }
}

export interface AiCallResult<T> {
  result: T;
  outputSummary?: string;
  promptTokens?: number;
  completionTokens?: number;
  /** Overrides meta.model on the record when the model is only known post-call. */
  model?: string;
}

export type AiAuditMeta = Pick<
  AiAuditRecord,
  "agencyId" | "clientId" | "action" | "provider" | "model" | "inputSummary"
>;

/**
 * Wrap an AI call so that exactly one audit record is written whether it succeeds
 * or throws. This is the ONLY sanctioned way to invoke a generative model — it
 * enforces the "every LLM action is audited" rule and times the call.
 */
export async function withAudit<T>(
  sink: AiAuditSink,
  meta: AiAuditMeta,
  fn: () => Promise<AiCallResult<T>>,
  clock: () => Date = () => new Date(),
): Promise<T> {
  const startedAt = clock().getTime();
  try {
    const out = await fn();
    const finishedAt = clock();
    await sink.record({
      ...meta,
      model: out.model ?? meta.model,
      status: "success",
      outputSummary: out.outputSummary,
      promptTokens: out.promptTokens,
      completionTokens: out.completionTokens,
      latencyMs: finishedAt.getTime() - startedAt,
      createdAt: finishedAt,
    });
    return out.result;
  } catch (err) {
    const finishedAt = clock();
    await sink.record({
      ...meta,
      status: "error",
      error: safeErrorMessage(err),
      latencyMs: finishedAt.getTime() - startedAt,
      createdAt: finishedAt,
    });
    throw err;
  }
}
