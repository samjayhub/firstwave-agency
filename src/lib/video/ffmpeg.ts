// Real video assembler — shells out to a local ffmpeg binary to stitch the B-roll
// stills (held for their allotted durations via the concat demuxer) under the
// narration track. Only used when VIDEO_ASSEMBLER=ffmpeg; the fake is the default
// so the pipeline runs with no binary. The spawn fn is injectable for testing.
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import { ExternalServiceError } from "@/lib/errors/app-error";
import { contentTypeForKey } from "@/lib/creative/asset-storage";
import type { AssembledVideo, AssembleRequest, VideoAssembler } from "./types";

const execFileAsync = promisify(execFile);

type RunFfmpeg = (binary: string, args: string[]) => Promise<void>;

const defaultRunner: RunFfmpeg = async (binary, args) => {
  // 8 MB stderr buffer: ffmpeg is run with -loglevel error below, but keep
  // headroom so a verbose failure doesn't trip execFile's maxBuffer ceiling.
  await execFileAsync(binary, args, { timeout: 290_000, maxBuffer: 8 << 20 });
};

function extForContentType(contentType: string): string {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
  return ".png";
}

function audioExt(contentType: string): string {
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return ".mp3";
  if (contentType.includes("mp4") || contentType.includes("m4a")) return ".m4a";
  if (contentType.includes("wav")) return ".wav";
  return ".mp3";
}

export class FfmpegVideoAssembler implements VideoAssembler {
  constructor(
    private readonly binary = "ffmpeg",
    private readonly run: RunFfmpeg = defaultRunner,
  ) {}

  async assemble(req: AssembleRequest): Promise<AssembledVideo> {
    if (req.clips.length === 0) {
      throw new ExternalServiceError("Cannot assemble a video with no clips");
    }
    const durationSec =
      Math.round(req.clips.reduce((sum, c) => sum + c.durationSec, 0) * 100) / 100;

    const dir = await mkdtemp(join(tmpdir(), "fw-video-"));
    try {
      // Write each still and a concat-demuxer manifest. The last image is repeated
      // with no trailing `duration` — an ffmpeg quirk so its segment isn't dropped.
      const concatLines: string[] = [];
      for (let i = 0; i < req.clips.length; i++) {
        const clip = req.clips[i]!;
        const imgPath = join(dir, `clip-${i}${extForContentType(clip.contentType)}`);
        await writeFile(imgPath, clip.imageBytes);
        concatLines.push(`file '${imgPath.replace(/'/g, "'\\''")}'`);
        concatLines.push(`duration ${clip.durationSec}`);
      }
      const lastImg = join(
        dir,
        `clip-${req.clips.length - 1}${extForContentType(req.clips.at(-1)!.contentType)}`,
      );
      concatLines.push(`file '${lastImg.replace(/'/g, "'\\''")}'`);

      const listPath = join(dir, "clips.txt");
      const audioPath = join(dir, `audio${audioExt(req.audio.contentType)}`);
      const outPath = join(dir, "out.mp4");
      await writeFile(listPath, concatLines.join("\n"));
      await writeFile(audioPath, req.audio.bytes);

      try {
        await this.run(this.binary, [
          "-y", "-loglevel", "error", "-nostats",
          "-f", "concat", "-safe", "0", "-i", listPath,
          "-i", audioPath,
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
          "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
          "-c:a", "aac", "-shortest",
          outPath,
        ]);
      } catch (err) {
        throw new ExternalServiceError("ffmpeg assembly failed", { cause: err });
      }

      const bytes = await readFile(outPath);
      return {
        bytes,
        contentType: contentTypeForKey(`out${extname(outPath)}`),
        durationSec,
        assembler: "ffmpeg",
      };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
