// Hosted TTS provider. A thin adapter over a hosted speech API; request/response
// shapes vary per vendor, so the endpoint + fetch are injectable and this is a
// template to tune per provider. The fake provider is the default until a key is
// configured (see getTtsProvider in ./index). Mirrors creative/hosted.ts.
import { ExternalServiceError } from "@/lib/errors/app-error";
import type { TtsProvider, TtsRequest, TtsResult } from "./types";

type FetchFn = typeof fetch;
type Vendor = "openai" | "elevenlabs";

const DEFAULT_ENDPOINTS: Record<Vendor, string> = {
  openai: "https://api.openai.com/v1/audio/speech",
  elevenlabs: "https://api.elevenlabs.io/v1/text-to-speech",
};

const DEFAULT_MODELS: Record<Vendor, string> = {
  openai: "tts-1",
  elevenlabs: "eleven_multilingual_v2",
};

const DEFAULT_VOICES: Record<Vendor, string> = {
  openai: "alloy",
  elevenlabs: "Rachel",
};

export class HostedTtsProvider implements TtsProvider {
  constructor(
    private readonly apiKey: string,
    private readonly vendor: Vendor,
    private readonly opts: { fetchFn?: FetchFn; endpoint?: string; timeoutMs?: number } = {},
  ) {}

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    const fetchFn = this.opts.fetchFn ?? fetch;
    const endpoint = this.opts.endpoint ?? DEFAULT_ENDPOINTS[this.vendor];
    const model = DEFAULT_MODELS[this.vendor];
    const voice = req.voice ?? DEFAULT_VOICES[this.vendor];

    let res: Response;
    try {
      res = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, voice, input: req.text }),
        signal: AbortSignal.timeout(this.opts.timeoutMs ?? 110_000),
      });
    } catch (err) {
      throw new ExternalServiceError("TTS request failed", { cause: err });
    }

    if (!res.ok) {
      throw new ExternalServiceError(`TTS failed with status ${res.status}`);
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0) throw new ExternalServiceError("TTS returned no audio data");
    return { bytes, contentType: "audio/mpeg", model };
  }
}
