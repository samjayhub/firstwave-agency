import { describe, it, expect } from "vitest";
import { SelfHostedImageProvider } from "./self-hosted";

const req = {
  prompt: "a cat on a skateboard",
  style: { palette: ["#000"], fonts: ["Inter"] },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

const PNG = Buffer.from("89504e47", "hex").toString("base64");

describe("SelfHostedImageProvider", () => {
  it("posts the built prompt + configured model and decodes inline base64", async () => {
    let sent: any;
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return json({ b64_json: PNG });
    }) as unknown as typeof fetch;
    const out = await new SelfHostedImageProvider({
      endpoint: "http://gpu/img",
      model: "sdxl-turbo",
      fetchFn,
    }).generateImage(req);
    expect(out.model).toBe("sdxl-turbo");
    expect(out.contentType).toBe("image/png");
    expect(out.bytes.length).toBeGreaterThan(0);
    expect(sent.model).toBe("sdxl-turbo");
    expect(sent.prompt).toContain("a cat on a skateboard");
  });

  it("reads base64 from an images[] array", async () => {
    const fetchFn = (async () => json({ images: [{ b64_json: PNG }] })) as unknown as typeof fetch;
    const out = await new SelfHostedImageProvider({ endpoint: "http://gpu/img", fetchFn }).generateImage(req);
    expect(out.bytes.length).toBeGreaterThan(0);
    expect(out.model).toBe("sdxl"); // default
  });

  it("fetches the image when the server returns a URL", async () => {
    const fetchFn = (async (url: string | URL) => {
      const u = url.toString();
      if (u.includes("/img")) return json({ url: "http://cdn/out.png" });
      return new Response(Buffer.from("89504e47", "hex"), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    }) as unknown as typeof fetch;
    const out = await new SelfHostedImageProvider({ endpoint: "http://gpu/img", fetchFn }).generateImage(req);
    expect(out.bytes.length).toBeGreaterThan(0);
    expect(out.contentType).toBe("image/png");
  });

  it("attaches a bearer token when configured", async () => {
    let auth: string | null = null;
    const fetchFn = (async (_url: string | URL, init?: RequestInit) => {
      auth = new Headers(init?.headers).get("authorization");
      return json({ b64_json: PNG });
    }) as unknown as typeof fetch;
    await new SelfHostedImageProvider({ endpoint: "http://gpu/img", token: "t0k", fetchFn }).generateImage(req);
    expect(auth).toBe("Bearer t0k");
  });

  it("maps a non-2xx response to ExternalServiceError", async () => {
    const fetchFn = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(
      new SelfHostedImageProvider({ endpoint: "http://gpu/img", fetchFn }).generateImage(req),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });

  it("fails when the server returns neither bytes nor a URL", async () => {
    const fetchFn = (async () => json({})) as unknown as typeof fetch;
    await expect(
      new SelfHostedImageProvider({ endpoint: "http://gpu/img", fetchFn }).generateImage(req),
    ).rejects.toMatchObject({ code: "EXTERNAL_SERVICE" });
  });
});
