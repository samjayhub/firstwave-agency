// DB-backed AiAuditSink — the production audit destination. Persists each record
// to the AiAuditLog table. The union types (action/status) are stored as strings
// to match the schema; MAX_ERROR_LEN truncation already happened in withAudit.
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AiAuditRecord, AiAuditSink } from "@/lib/audit/types";

export class PrismaAuditSink implements AiAuditSink {
  constructor(private readonly prisma: PrismaClient) {}

  async record(entry: AiAuditRecord): Promise<void> {
    // `satisfies` is a compile-time guard: if AiAuditRecord gains a field, this
    // mapping fails typecheck here instead of silently dropping it at runtime.
    const data = {
      agencyId: entry.agencyId,
      clientId: entry.clientId ?? null,
      action: entry.action,
      provider: entry.provider,
      model: entry.model,
      status: entry.status,
      inputSummary: entry.inputSummary,
      outputSummary: entry.outputSummary ?? null,
      promptTokens: entry.promptTokens ?? null,
      completionTokens: entry.completionTokens ?? null,
      latencyMs: entry.latencyMs ?? null,
      error: entry.error ?? null,
      createdAt: entry.createdAt,
    } satisfies Prisma.AiAuditLogUncheckedCreateInput;

    await this.prisma.aiAuditLog.create({ data });
  }
}
