// Deterministic assembler for tests / no-binary dev. Concatenates marker bytes for
// each clip plus the audio into a small placeholder buffer and reports the summed
// runtime, so the pipeline produces a real (if non-playable) video Asset offline.
import type { AssembledVideo, AssembleRequest, VideoAssembler } from "../types";

export class FakeVideoAssembler implements VideoAssembler {
  readonly calls: AssembleRequest[] = [];

  async assemble(req: AssembleRequest): Promise<AssembledVideo> {
    this.calls.push(req);
    const durationSec =
      Math.round(req.clips.reduce((sum, c) => sum + c.durationSec, 0) * 100) / 100;
    const header = Buffer.from(`FAKE_MP4:${req.clips.length}clips:${durationSec}s\n`, "utf8");
    const body = Buffer.concat([
      header,
      ...req.clips.map((c) => c.imageBytes),
      req.audio.bytes,
    ]);
    return { bytes: body, contentType: "video/mp4", durationSec, assembler: "fake" };
  }
}
