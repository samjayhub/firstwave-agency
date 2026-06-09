import { describe, it, expect } from "vitest";
import {
  allocateDurations,
  buildScriptMessages,
  fullNarration,
  MIN_CLIP_SECONDS,
  ScriptSchema,
} from "./script";
import type { VideoScene, VideoScript } from "./types";

const SCENES: VideoScene[] = [
  { narration: "one two three four", visual: "a gym" }, // 4 words
  { narration: "five six", visual: "a smoothie" }, // 2 words
];

describe("buildScriptMessages", () => {
  it("includes pain point, platform, length, and optional topic/voice", () => {
    const [msg] = buildScriptMessages({
      painPoint: "I can't stay consistent",
      platform: "youtube",
      targetSeconds: 45,
      topic: "habit",
      brandVoice: "warm, direct",
    });
    expect(msg!.role).toBe("user");
    expect(msg!.content).toContain("Pain point: I can't stay consistent");
    expect(msg!.content).toContain("Platform: youtube");
    expect(msg!.content).toContain("45 seconds");
    expect(msg!.content).toContain("Topic / pillar: habit");
    expect(msg!.content).toContain("Brand voice: warm, direct");
  });

  it("omits topic/voice lines when not provided", () => {
    const [msg] = buildScriptMessages({
      painPoint: "x",
      platform: "tiktok",
      targetSeconds: 30,
    });
    expect(msg!.content).not.toContain("Topic");
    expect(msg!.content).not.toContain("Brand voice");
  });
});

describe("allocateDurations", () => {
  it("splits the target proportionally to narration length and sums to target", () => {
    const d = allocateDurations(SCENES, 30);
    expect(d).toHaveLength(2);
    // Scene 0 has twice the words → longer hold.
    expect(d[0]!).toBeGreaterThan(d[1]!);
    expect(d[0]! + d[1]!).toBeCloseTo(30, 1);
  });

  it("enforces a per-clip floor when the target is too short", () => {
    const d = allocateDurations(SCENES, 1);
    for (const sec of d) expect(sec).toBeGreaterThanOrEqual(MIN_CLIP_SECONDS);
  });

  it("returns [] for no scenes", () => {
    expect(allocateDurations([], 30)).toEqual([]);
  });
});

describe("fullNarration", () => {
  it("orders hook → scenes → cta", () => {
    const script: VideoScript = {
      title: "T",
      painPoint: "p",
      hook: "HOOK",
      scenes: [{ narration: "S1", visual: "v" }, { narration: "S2", visual: "v" }],
      cta: "CTA",
    };
    expect(fullNarration(script)).toBe("HOOK\nS1\nS2\nCTA");
  });
});

describe("ScriptSchema", () => {
  it("rejects an empty scenes array", () => {
    const r = ScriptSchema.safeParse({ title: "t", hook: "h", scenes: [], cta: "c" });
    expect(r.success).toBe(false);
  });

  it("accepts a well-formed script", () => {
    const r = ScriptSchema.safeParse({
      title: "t",
      hook: "h",
      scenes: [{ narration: "n", visual: "v", caption: "c" }],
      cta: "c",
    });
    expect(r.success).toBe(true);
  });
});
