import { describe, it, expect } from "vitest";
import { SelfHostedTtsProvider } from "./self-hosted-tts";

const audioResponse = () =>
  new Response(Buffer.from("ID3audio"), {
    status: 200,
    headers: { "content-type": "audio/mpeg" },
  });

describe("SelfHostedTtsProvider", () => {
  it("posts text + configured model and returns audio bytes", async () => {
    let sent: any;
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return audioResponse();
    }) as unknown as typeof fetch;
    const out = await new SelfHostedTtsProvider({
      endpoint: "http://gpu/tts",
      model: "piper",
      fetchFn,
    }).synthesize({ text: "hello world", voice: "amy" });
    expect(out.model).toBe("piper");
    expect(out.contentType).toBe("audio/mpeg");
    expect(out.bytes.length).toBeGreaterThan(0);
    expect(sent.input).toBe("hello world");
    expect(sent.voice).toBe("amy");
  });

  it("defaults the model and omits voice when not given", async () => {
    let sent: any;
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return audioResponse();
    }) as unknown as typeof fetch;
    const out = await new SelfHostedTtsProvider({ endpoint: "http://gpu/tts", fetchFn }).synthesize({
      text: "hi",
    });
    expect(out.model).toBe("xtts-v2");
    expect(sent).not.toHaveProperty("voice");
  });

  it("attaches a bearer token when configured", async () => {
    let auth: string | null = null;
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization");
      return audioResponse();
    }) as unknown as typeof fetch;
    await new SelfHostedTtsProvider({ endpoint: "http://gpu/tts", token: "t0k", fetchFn }).synthesize({
      text: "hi",
    });
    expect(auth).toBe("Bearer t0k");
  });

  it("maps a non-2xx response to ExternalServiceError", async () => {
    const fetchFn = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(
      new SelfHostedTtsProvider({ endpoint: "http://gpu/tts", fetchFn }).synthesize({ text: "hi" }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });

  it("fails on an empty audio body", async () => {
    const fetchFn = (async () => new Response(Buffer.alloc(0), { status: 200 })) as unknown as typeof fetch;
    await expect(
      new SelfHostedTtsProvider({ endpoint: "http://gpu/tts", fetchFn }).synthesize({ text: "hi" }),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});
