// Creative Studio video — the long-form pain-point pipeline (P3-01, roadmap §3):
// script (Claude) → B-roll stills (reused image provider) → TTS narration →
// assembly (ffmpeg) → one stored video Asset. Everything external is behind an
// interface so hosted APIs ↔ self-hosted models is a config swap (docs/02 §5,§7),
// and tests run with deterministic fakes and no binaries.
import type { BrandStyle } from "@/lib/creative";
import type { Platform } from "@/lib/publishers/types";

// ── Script (the one LLM synthesis call) ──────────────────────
export interface VideoScene {
  /** Spoken narration for this scene. */
  narration: string;
  /** Visual description used to source/generate the B-roll still. */
  visual: string;
  /** Optional on-screen caption/title. Reserved — carried through the pipeline
   *  but not yet burned into the frame by the assembler. */
  caption?: string;
}

export interface VideoScript {
  title: string;
  /** The pain point this video addresses (echoed back for grounding). */
  painPoint: string;
  /** Opening hook line, spoken first. */
  hook: string;
  scenes: VideoScene[];
  /** Closing call to action, spoken last. */
  cta: string;
}

export interface ScriptRequest {
  painPoint: string;
  platform: Platform;
  /** Topical hint (content pillar / niche) to focus the script. */
  topic?: string;
  /** Condensed brand-voice cue, e.g. "confident, warm, concise". */
  brandVoice?: string;
  /** Desired finished length in seconds. */
  targetSeconds: number;
}

// ── Text-to-speech ───────────────────────────────────────────
export interface TtsRequest {
  text: string;
  /** Provider voice id; provider picks a default when omitted. */
  voice?: string;
}

export interface TtsResult {
  bytes: Buffer;
  contentType: string;
  model: string;
  /** Narration length in seconds, when the provider reports it. */
  durationSec?: number;
}

export interface TtsProvider {
  synthesize(req: TtsRequest): Promise<TtsResult>;
}

// ── Assembly ─────────────────────────────────────────────────
export interface VideoClip {
  /** A B-roll still shown for `durationSec`. */
  imageBytes: Buffer;
  contentType: string;
  durationSec: number;
  /** Reserved caption text; not yet rendered onto the clip. */
  caption?: string;
}

export interface AssembleRequest {
  clips: VideoClip[];
  /** Single narration track laid over the whole video. */
  audio: { bytes: Buffer; contentType: string };
  style: BrandStyle;
}

export interface AssembledVideo {
  bytes: Buffer;
  contentType: string;
  durationSec: number;
  /** Identifier of the assembler that produced the bytes (e.g. "ffmpeg", "fake"). */
  assembler: string;
}

export interface VideoAssembler {
  assemble(req: AssembleRequest): Promise<AssembledVideo>;
}
