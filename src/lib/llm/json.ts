// Helpers to pull JSON out of an LLM completion. Models often wrap JSON in prose
// or ``` fences; these prefer a fenced block, then fall back to the outermost
// brace/bracket span. Malformed output is a mapped ExternalServiceError.
import { ExternalServiceError } from "@/lib/errors/app-error";

function fencedOrRaw(raw: string): string {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fence ? fence[1]! : raw;
}

export function extractJsonObject(raw: string): unknown {
  const body = fencedOrRaw(raw);
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new ExternalServiceError("LLM response contained no JSON object");
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new ExternalServiceError("LLM response contained invalid JSON");
  }
}

export function extractJsonArray(raw: string): unknown[] {
  const body = fencedOrRaw(raw);
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new ExternalServiceError("LLM response contained no JSON array");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    throw new ExternalServiceError("LLM response contained invalid JSON");
  }
  if (!Array.isArray(parsed)) {
    throw new ExternalServiceError("LLM response was not a JSON array");
  }
  return parsed;
}
