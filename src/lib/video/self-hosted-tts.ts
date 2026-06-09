// Self-hosted TTS provider (P3-07). Talks to an open speech model on our own GPU
// box over HTTP — the same TtsProvider contract as the hosted adapter, so it's a
// config swap (TTS_PROVIDER=selfhosted). No metered per-call cost; auth is an
// optional bearer for the internal endpoint. Returns raw audio bytes. Mirrors
// creative/self-hosted.ts. Endpoint + fetch are injectable.
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { TtsProvider, TtsRequest, TtsResult } from "./types";

type FetchFn = typeof fetch;

export interface SelfHostedTtsConfig {
  endpoint: string;
  model?: string;
  token?: string;
  fetchFn?: FetchFn;
  timeoutMs?: number;
}

export class SelfHostedTtsProvider implements TtsProvider {
  private readonly model: string;
  private readonly fetchFn: FetchFn;

  constructor(private readonly config: SelfHostedTtsConfig) {
    this.model = config.model ?? "xtts-v2";
    this.fetchFn = config.fetchFn ?? fetch;
  }

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (this.config.token) headers.authorization = `Bearer ${this.config.token}`;

    let res: Response;
    try {
      res = await this.fetchFn(this.config.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          ...(req.voice ? { voice: req.voice } : {}),
          input: req.text,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 110_000),
      });
    } catch (err) {
      throw new ExternalServiceError("Self-hosted TTS request failed", { cause: err });
    }
    if (!res.ok) {
      throw new ExternalServiceError(`Self-hosted TTS failed (${res.status})`);
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) throw new ExternalServiceError("Self-hosted TTS returned no audio data");
    return {
      bytes,
      contentType: res.headers.get("content-type") ?? "audio/mpeg",
      model: this.model,
    };
  }
}
