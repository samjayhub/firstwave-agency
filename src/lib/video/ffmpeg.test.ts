import { describe, it, expect } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { FfmpegVideoAssembler } from "./ffmpeg";
import type { AssembleRequest } from "./types";
import { ExternalServiceError } from "@/lib/errors/app-error";

function req(): AssembleRequest {
  return {
    clips: [
      { imageBytes: Buffer.from("img0"), contentType: "image/png", durationSec: 3 },
      { imageBytes: Buffer.from("img1"), contentType: "image/png", durationSec: 4.5 },
    ],
    audio: { bytes: Buffer.from("audio"), contentType: "audio/mpeg" },
    style: { palette: ["#000"], fonts: ["Inter"] },
  };
}

describe("FfmpegVideoAssembler", () => {
  it("builds a concat manifest, invokes ffmpeg, and returns the muxed bytes", async () => {
    const seen: { binary: string; args: string[]; manifest: string } = {
      binary: "",
      args: [],
      manifest: "",
    };
    const assembler = new FfmpegVideoAssembler("ffmpeg-bin", async (binary, args) => {
      seen.binary = binary;
      seen.args = args;
      // The concat list is the arg after "-i" before the audio "-i".
      const listPath = args[args.indexOf("-i") + 1]!;
      seen.manifest = await readFile(listPath, "utf8");
      // Stand in for ffmpeg: write the output file (the last arg).
      await writeFile(args.at(-1)!, Buffer.from("MP4BYTES"));
    });

    const out = await assembler.assemble(req());

    expect(seen.binary).toBe("ffmpeg-bin");
    expect(seen.args).toContain("libx264");
    // Manifest lists both stills with their durations + the repeated last frame.
    expect(seen.manifest).toContain("duration 3");
    expect(seen.manifest).toContain("duration 4.5");
    expect((seen.manifest.match(/file '/g) ?? []).length).toBe(3);
    expect(out.assembler).toBe("ffmpeg");
    expect(out.contentType).toBe("video/mp4");
    expect(out.durationSec).toBe(7.5);
    expect(out.bytes.toString()).toBe("MP4BYTES");
  });

  it("still times the clip for a single-scene video (repeats the last frame)", async () => {
    let manifest = "";
    const assembler = new FfmpegVideoAssembler("ffmpeg", async (_b, args) => {
      manifest = await readFile(args[args.indexOf("-i") + 1]!, "utf8");
      await writeFile(args.at(-1)!, Buffer.from("x"));
    });
    await assembler.assemble({
      clips: [{ imageBytes: Buffer.from("only"), contentType: "image/png", durationSec: 6 }],
      audio: { bytes: Buffer.from("a"), contentType: "audio/mpeg" },
      style: { palette: [], fonts: [] },
    });
    // Timed entry + trailing repeat so the lone image isn't shown for one frame.
    expect(manifest).toContain("duration 6");
    expect((manifest.match(/file '/g) ?? []).length).toBe(2);
  });

  it("wraps a runner failure in ExternalServiceError", async () => {
    const assembler = new FfmpegVideoAssembler("ffmpeg", async () => {
      throw new Error("exit 1");
    });
    await expect(assembler.assemble(req())).rejects.toBeInstanceOf(ExternalServiceError);
  });

  it("rejects an empty clip list", async () => {
    const assembler = new FfmpegVideoAssembler("ffmpeg", async () => {});
    await expect(
      assembler.assemble({ ...req(), clips: [] }),
    ).rejects.toBeInstanceOf(ExternalServiceError);
  });
});
