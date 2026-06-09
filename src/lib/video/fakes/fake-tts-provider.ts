// Deterministic TTS for tests / no-key dev. Returns a tiny non-empty buffer so the
// rest of the pipeline (assembly, storage, Asset row) exercises real bytes, and a
// word-count-derived duration (~150 wpm) so timing maths has something to work on.
import type { TtsProvider, TtsRequest, TtsResult } from "../types";

const WORDS_PER_SECOND = 2.5;

export class FakeTtsProvider implements TtsProvider {
  readonly calls: TtsRequest[] = [];

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    this.calls.push(req);
    const words = req.text.trim().split(/\s+/).filter(Boolean).length;
    const durationSec = Math.max(1, Math.round((words / WORDS_PER_SECOND) * 100) / 100);
    return {
      bytes: Buffer.from(`FAKE_TTS:${words}w`, "utf8"),
      contentType: "audio/mpeg",
      model: "fake-tts",
      durationSec,
    };
  }
}
