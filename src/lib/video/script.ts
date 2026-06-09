// Pure helpers for the video pipeline: the Claude script prompt + schema, and the
// deterministic allocation of the target runtime across scenes. Kept out of the
// service so the prompt and the (audit-exempt) timing maths are unit-testable in
// isolation, mirroring creative/prompt.ts.
import { z } from "zod";
import type { LlmMessage } from "@/lib/llm";
import type { ScriptRequest, VideoScene, VideoScript } from "./types";

export const MIN_SCENES = 1;
export const MAX_SCENES = 8;
/** No clip shorter than this — sub-second cuts read as glitches. */
export const MIN_CLIP_SECONDS = 2;

export const ScriptSchema = z.object({
  title: z.string().min(1).max(200),
  hook: z.string().min(1).max(500),
  scenes: z
    .array(
      z.object({
        narration: z.string().min(1).max(800),
        visual: z.string().min(1).max(500),
        caption: z.string().max(120).optional(),
      }),
    )
    .min(MIN_SCENES)
    .max(MAX_SCENES),
  cta: z.string().min(1).max(500),
});

export const SCRIPT_SYSTEM_PROMPT = [
  "You are a short-form video scriptwriter for social media.",
  "Given a customer pain point, write a tight, value-first video script that names",
  "the pain, builds tension, and resolves it. Structure:",
  "- title: a scroll-stopping title for the video",
  "- hook: one spoken sentence that opens on the pain (no 'hey guys')",
  `- scenes: ${MIN_SCENES}-${MAX_SCENES} scenes, each with`,
  "    narration (one or two spoken sentences),",
  "    visual (a concrete B-roll shot description for an image generator), and",
  "    an optional short caption to burn on screen",
  "- cta: one spoken closing sentence with a clear next step",
  "Keep narration conversational and matched to the requested length. Write in the",
  "brand voice when given. Respond with ONLY a JSON object, no prose, no code fences:",
  '{"title":"...","hook":"...","scenes":[{"narration":"...","visual":"...","caption":"..."}],"cta":"..."}',
].join("\n");

export function buildScriptMessages(req: ScriptRequest): LlmMessage[] {
  const lines = [
    `Pain point: ${req.painPoint}`,
    `Platform: ${req.platform}`,
    `Target length: ${req.targetSeconds} seconds`,
  ];
  if (req.topic) lines.push(`Topic / pillar: ${req.topic}`);
  if (req.brandVoice) lines.push(`Brand voice: ${req.brandVoice}`);
  return [{ role: "user", content: lines.join("\n") }];
}

function wordCount(text: string): number {
  const n = text.trim().split(/\s+/).filter(Boolean).length;
  return n > 0 ? n : 1;
}

/**
 * Split `targetSeconds` across scenes proportionally to narration length, with a
 * per-clip floor. Deterministic (AUDIT-EXEMPT) — drives how long each B-roll still
 * is held. The returned array lines up index-for-index with `scenes`.
 */
export function allocateDurations(scenes: VideoScene[], targetSeconds: number): number[] {
  if (scenes.length === 0) return [];
  const floorTotal = scenes.length * MIN_CLIP_SECONDS;
  const budget = Math.max(targetSeconds, floorTotal);
  const weights = scenes.map((s) => wordCount(s.narration));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const flexible = budget - floorTotal;
  return weights.map((w) =>
    Math.round((MIN_CLIP_SECONDS + (flexible * w) / weightSum) * 100) / 100,
  );
}

/** Full narration read over the video, in order: hook → scenes → cta. */
export function fullNarration(script: VideoScript): string {
  return [script.hook, ...script.scenes.map((s) => s.narration), script.cta]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}
