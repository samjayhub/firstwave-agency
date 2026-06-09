// Creative Studio video service — turns a content item's pain point into a finished
// video: Claude writes the script (audited `video_script`), the image provider draws
// one B-roll still per scene (each audited `image_generation`), TTS narrates the whole
// script (audited `tts_generation`), and the assembler muxes stills + audio into an
// mp4 (deterministic — AUDIT-EXEMPT). The bytes are stored and recorded as one video
// Asset on the item. Everything external is injected for testability.
import { randomUUID } from "node:crypto";
import type { TenantContext } from "@/lib/db/tenancy";
import { withAudit, type AiAuditSink, type AiAuditMeta } from "@/lib/audit";
import type { LlmProvider } from "@/lib/llm";
import { extractJsonObject } from "@/lib/llm/json";
import { getEnv } from "@/lib/config/env";
import { ExternalServiceError, NotFoundError, ValidationError } from "@/lib/errors/app-error";
import type { BrandProfileStore } from "@/lib/brand-intel";
import type { ContentItemStore } from "@/lib/copy";
import type { AssetRecord, AssetRepository } from "@/lib/creative";
import { getCreativeProvider, type AssetStorage, type CreativeProvider } from "@/lib/creative";
import type { StoredCopy } from "@/lib/content/types";
import type { Platform } from "@/lib/publishers/types";
import {
  allocateDurations,
  buildScriptMessages,
  fullNarration,
  ScriptSchema,
  SCRIPT_SYSTEM_PROMPT,
} from "./script";
import { FakeTtsProvider } from "./fakes/fake-tts-provider";
import { FakeVideoAssembler } from "./fakes/fake-video-assembler";
import { HostedTtsProvider } from "./tts";
import { FfmpegVideoAssembler } from "./ffmpeg";
import type {
  AssembledVideo,
  TtsProvider,
  VideoAssembler,
  VideoClip,
  VideoScript,
} from "./types";

export * from "./types";
export {
  allocateDurations,
  buildScriptMessages,
  fullNarration,
  ScriptSchema,
  SCRIPT_SYSTEM_PROMPT,
} from "./script";

const DEFAULT_TARGET_SECONDS = 60;
const MIN_TARGET_SECONDS = 15;
const MAX_TARGET_SECONDS = 180;

export interface ProduceVideoOptions {
  /** Override the pain point; defaults to the item's planned content idea. */
  painPoint?: string;
  /** Desired finished length in seconds (clamped 15–180). */
  targetSeconds?: number;
}

export interface VideoStudioDeps {
  llm: LlmProvider;
  model: string;
  tts: TtsProvider;
  /** Reuses the image provider to draw B-roll stills. */
  broll: CreativeProvider;
  assembler: VideoAssembler;
  storage: AssetStorage;
  assets: AssetRepository;
  items: ContentItemStore;
  brandProfiles: BrandProfileStore;
  sink: AiAuditSink;
  idGen?: () => string;
  clock?: () => Date;
}

export class VideoStudioService {
  private readonly idGen: () => string;
  private readonly clock: () => Date;

  constructor(private readonly deps: VideoStudioDeps) {
    this.idGen = deps.idGen ?? (() => randomUUID());
    this.clock = deps.clock ?? (() => new Date());
  }

  async produceVideo(
    ctx: TenantContext,
    itemId: string,
    options: ProduceVideoOptions = {},
  ): Promise<AssetRecord> {
    const item = await this.deps.items.findForAgency(ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Content item not found");

    const copy = item.copy as StoredCopy | null;
    const brief = copy?.brief;
    const painPoint = options.painPoint?.trim() || brief?.idea;
    if (!painPoint) {
      throw new ValidationError("No pain point available; provide one or plan the item first");
    }

    const platform: Platform = copy?.platform ?? "youtube";
    const targetSeconds = clamp(
      options.targetSeconds ?? DEFAULT_TARGET_SECONDS,
      MIN_TARGET_SECONDS,
      MAX_TARGET_SECONDS,
    );

    const profile = await this.deps.brandProfiles.findByClient(item.clientId);
    const style = {
      palette: (profile?.palette ?? []).map((p) => p.hex),
      fonts: (profile?.fonts ?? []).map((f) => f.family),
    };
    const brandVoice = profile?.voice?.tone?.length
      ? profile.voice.tone.join(", ")
      : undefined;

    // 1. Script — the LLM synthesis (audited). targetSeconds guides how much
    //    script to write; the finished runtime follows the narration (step 3).
    const script = await this.writeScript(ctx, item.clientId, itemId, {
      painPoint,
      platform,
      topic: brief?.pillar,
      brandVoice,
      targetSeconds,
    });

    // 2. TTS — narrate the whole script in one track (audited). Done before the
    //    B-roll so clip durations can be sized to the real narration length.
    const audio = await this.narrate(ctx, item.clientId, itemId, script);

    // 3. B-roll — one still per scene (each audited as image_generation), each
    //    held long enough that the stills span the narration (falls back to the
    //    requested target when the TTS provider doesn't report a duration).
    const runtimeSeconds = audio.durationSec ?? targetSeconds;
    const durations = allocateDurations(script.scenes, runtimeSeconds);
    const clips: VideoClip[] = [];
    for (let i = 0; i < script.scenes.length; i++) {
      const scene = script.scenes[i]!;
      const img = await withAudit(
        this.deps.sink,
        {
          agencyId: ctx.agencyId,
          clientId: item.clientId,
          action: "image_generation",
          provider: "image-gen",
          model: "image-gen",
          inputSummary: `b-roll scene ${i + 1}/${script.scenes.length} for video item ${itemId}`,
        },
        async () => {
          const r = await this.deps.broll.generateImage({ prompt: scene.visual, style });
          return { result: r, outputSummary: r.model, model: r.model };
        },
      );
      clips.push({
        imageBytes: img.bytes,
        contentType: img.contentType,
        durationSec: durations[i]!,
        caption: scene.caption,
      });
    }

    // 4. Assembly — deterministic mux (AUDIT-EXEMPT, see file header).
    const video: AssembledVideo = await this.deps.assembler.assemble({
      clips,
      audio: { bytes: audio.bytes, contentType: audio.contentType },
      style,
    });

    const key = `${item.clientId}/${itemId}/${this.idGen()}.mp4`;
    const stored = await this.deps.storage.put(key, video.bytes, video.contentType);

    return this.deps.assets.create(ctx.agencyId, {
      contentItemId: itemId,
      kind: "video",
      url: stored.url,
      source: "generated",
      meta: {
        assembler: video.assembler,
        scriptModel: this.deps.model,
        ttsModel: audio.model,
        durationSec: video.durationSec,
        sceneCount: script.scenes.length,
        painPoint,
        platform,
        script,
      },
    });
  }

  async listForItem(ctx: TenantContext, itemId: string): Promise<AssetRecord[]> {
    const item = await this.deps.items.findForAgency(ctx.agencyId, itemId);
    if (!item) throw new NotFoundError("Content item not found");
    const assets = await this.deps.assets.listForItem(ctx.agencyId, itemId);
    return assets.filter((a) => a.kind === "video");
  }

  private async writeScript(
    ctx: TenantContext,
    clientId: string,
    itemId: string,
    req: Parameters<typeof buildScriptMessages>[0],
  ): Promise<VideoScript> {
    const meta: AiAuditMeta = {
      agencyId: ctx.agencyId,
      clientId,
      action: "video_script",
      provider: "anthropic",
      model: this.deps.model,
      inputSummary: `video script for item ${itemId} (${req.platform}, ${req.targetSeconds}s)`,
    };

    return withAudit(this.deps.sink, meta, async () => {
      const raw = await this.deps.llm.complete(buildScriptMessages(req), {
        system: SCRIPT_SYSTEM_PROMPT,
        maxTokens: 2048,
      });
      const parsed = ScriptSchema.safeParse(extractJsonObject(raw));
      if (!parsed.success) {
        throw new ExternalServiceError("Video script response failed schema validation");
      }
      const script: VideoScript = { ...parsed.data, painPoint: req.painPoint };
      return {
        result: script,
        outputSummary: `"${script.title}" — ${script.scenes.length} scenes`,
      };
    });
  }

  private async narrate(
    ctx: TenantContext,
    clientId: string,
    itemId: string,
    script: VideoScript,
  ) {
    const text = fullNarration(script);
    return withAudit(
      this.deps.sink,
      {
        agencyId: ctx.agencyId,
        clientId,
        action: "tts_generation",
        provider: "tts",
        model: "tts",
        inputSummary: `narration for video item ${itemId} (${text.length} chars)`,
      },
      async () => {
        const r = await this.deps.tts.synthesize({ text });
        if (r.bytes.length === 0) {
          throw new ExternalServiceError("TTS returned no audio");
        }
        return { result: r, outputSummary: r.model, model: r.model };
      },
    );
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Production TTS provider — fake until a key/provider is configured. */
export function getTtsProvider(): TtsProvider {
  const env = getEnv();
  if (env.TTS_PROVIDER === "fake" || !env.TTS_API_KEY) {
    return new FakeTtsProvider();
  }
  return new HostedTtsProvider(env.TTS_API_KEY, env.TTS_PROVIDER);
}

/** Production B-roll provider — reuses the configured image generator. */
export function getBrollProvider(): CreativeProvider {
  return getCreativeProvider();
}

/** Production video assembler — fake (placeholder bytes) until ffmpeg is selected. */
export function getVideoAssembler(): VideoAssembler {
  const env = getEnv();
  if (env.VIDEO_ASSEMBLER === "ffmpeg") {
    return new FfmpegVideoAssembler(env.FFMPEG_PATH);
  }
  return new FakeVideoAssembler();
}
