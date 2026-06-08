// AI audit trail. Architectural rule: EVERY LLM/generative action is recorded to
// an audit log. Rule-based (deterministic, non-AI) features are exempt and should
// be annotated `AUDIT-EXEMPT: <reason>` where the question might arise.
//
// This file is the provider-agnostic contract. The DB-backed sink lands once the
// AiAuditLog Prisma model exists (PR2); until then an in-memory / logger sink is
// used (see ./index).

export type AiAction =
  | "brand_voice_analysis"
  | "content_plan"
  | "copy_generation"
  | "image_generation"
  | "competitor_analysis"
  | "trend_analysis"
  | "research_brief";

export type AiAuditStatus = "success" | "error";

export interface AiAuditRecord {
  agencyId: string;
  clientId?: string;
  action: AiAction;
  /** e.g. "anthropic", "imagen", "ideogram". */
  provider: string;
  model: string;
  status: AiAuditStatus;
  /** Short, non-sensitive description of the input (never raw secrets). */
  inputSummary: string;
  outputSummary?: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
  error?: string;
  createdAt: Date;
}

/** Where audit records are persisted. Implementations: in-memory, logger, DB. */
export interface AiAuditSink {
  record(entry: AiAuditRecord): Promise<void>;
}
