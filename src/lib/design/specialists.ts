// The specialist agents. Each is a focused LLM role with its own system prompt
// and a strict JSON output the director composes. Kept pure (prompt + parse) so
// they are unit-testable and the director just orchestrates the calls + audit.
import { z } from "zod";
import { extractJsonObject } from "@/lib/llm/json";
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { ArtDirection, DesignColors, DesignCopy } from "./types";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function parse<T>(schema: z.ZodType<T>, raw: string, role: string): T {
  const parsed = schema.safeParse(extractJsonObject(raw));
  if (!parsed.success) {
    throw new ExternalServiceError(`Design ${role} output failed validation`);
  }
  return parsed.data;
}

// ── Art director: sets the creative direction the others work within ──
const ArtDirectionSchema = z.object({
  concept: z.string().min(1),
  mood: z.array(z.string()).min(1),
  composition: z.string().min(1),
});

export const ART_DIRECTOR_SYSTEM = [
  "You are the art director for a single social-media visual.",
  "From the brand context and the content brief, set the creative direction.",
  "Respond with ONLY a JSON object, no prose, no code fences:",
  '{"concept":"...","mood":["..."],"composition":"..."}',
  "- concept: the one-line creative idea. mood: 2-4 adjectives.",
  "- composition: how the visual is laid out (focal point, hierarchy, space).",
].join("\n");

export const parseArtDirection = (raw: string): ArtDirection =>
  parse(ArtDirectionSchema, raw, "art direction");

// ── Copywriter: the in-image text blocks ──
const DesignCopySchema = z.object({
  headline: z.string().min(1),
  subheadline: z.string(),
  cta: z.string(),
});

export const COPY_SPECIALIST_SYSTEM = [
  "You are a graphic-design copywriter writing the TEXT that appears IN the image",
  "(not the post caption). Work within the given art direction and brand voice.",
  "Respond with ONLY a JSON object, no prose, no code fences:",
  '{"headline":"...","subheadline":"...","cta":"..."}',
  "- headline: punchy, <=8 words. subheadline: one supporting line. cta: 2-4 words.",
].join("\n");

export const parseDesignCopy = (raw: string): DesignCopy =>
  parse(DesignCopySchema, raw, "copy");

// ── Colour specialist: assigns palette roles from the brand palette ──
const DesignColorsSchema = z.object({
  background: z.string().regex(HEX),
  foreground: z.string().regex(HEX),
  accent: z.string().regex(HEX),
});

export const COLOR_SPECIALIST_SYSTEM = [
  "You are a colour specialist. Assign palette ROLES for the visual using the",
  "brand palette provided. Prefer brand colours; ensure foreground/background",
  "contrast is legible.",
  "Respond with ONLY a JSON object of hex colours, no prose, no code fences:",
  '{"background":"#RRGGBB","foreground":"#RRGGBB","accent":"#RRGGBB"}',
].join("\n");

export const parseDesignColors = (raw: string): DesignColors =>
  parse(DesignColorsSchema, raw, "colour");

// ── Imagery specialist: the hero image prompt for the generator ──
const DesignImagerySchema = z.object({ imagePrompt: z.string().min(1) });

export const IMAGERY_SPECIALIST_SYSTEM = [
  "You are an imagery specialist. Write a single, vivid image-generation prompt",
  "for the hero visual that fits the art direction. No text instructions — the",
  "copy is overlaid separately. Describe subject, style, lighting, composition.",
  "Respond with ONLY a JSON object, no prose, no code fences:",
  '{"imagePrompt":"..."}',
].join("\n");

export const parseDesignImagery = (raw: string): string =>
  parse(DesignImagerySchema, raw, "imagery").imagePrompt;
