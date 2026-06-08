// Brand-voice analysis via the LLM. Every call is audited (withAudit). The model
// is asked for strict JSON, which is validated with zod; malformed output is a
// mapped EXTERNAL_SERVICE error, never a raw crash.
import { z } from "zod";
import { withAudit, type AiAuditSink, type AiAuditMeta } from "@/lib/audit";
import type { LlmProvider } from "@/lib/llm";
import { extractJsonObject } from "@/lib/llm/json";
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { BrandVoice } from "./types";

export { extractJsonObject };

const VoiceSchema = z.object({
  tone: z.array(z.string()).min(1),
  themes: z.array(z.string()),
  audience: z.string(),
  dos: z.array(z.string()),
  donts: z.array(z.string()),
});

const SYSTEM = [
  "You are a brand strategist analyzing a company from its website text.",
  "Infer the brand voice. Respond with ONLY a JSON object, no prose, no code fences:",
  '{"tone":["..."],"themes":["..."],"audience":"...","dos":["..."],"donts":["..."]}',
  "- tone: 3-6 adjectives. themes: recurring content themes.",
  "- audience: one sentence. dos/donts: short imperative guidance.",
].join("\n");

function buildPrompt(pageText: string): string {
  return `Website text (truncated):\n\n${pageText.slice(0, 8000)}`;
}

export function parseVoice(raw: string): BrandVoice {
  const parsed = VoiceSchema.safeParse(extractJsonObject(raw));
  if (!parsed.success) {
    throw new ExternalServiceError("Brand voice analysis output failed validation");
  }
  return parsed.data;
}

export interface VoiceDeps {
  llm: LlmProvider;
  sink: AiAuditSink;
  model: string;
}

export async function analyzeVoice(
  deps: VoiceDeps,
  scope: { agencyId: string; clientId: string },
  pageText: string,
): Promise<BrandVoice> {
  const meta: AiAuditMeta = {
    agencyId: scope.agencyId,
    clientId: scope.clientId,
    action: "brand_voice_analysis",
    provider: "anthropic",
    model: deps.model,
    inputSummary: `voice analysis over ${pageText.length} chars of page text`,
  };

  return withAudit(deps.sink, meta, async () => {
    const raw = await deps.llm.complete([{ role: "user", content: buildPrompt(pageText) }], {
      system: SYSTEM,
      maxTokens: 1024,
    });
    const voice = parseVoice(raw);
    return { result: voice, outputSummary: `tone: ${voice.tone.join(", ")}` };
  });
}
