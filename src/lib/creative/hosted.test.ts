import { describe, it, expect } from "vitest";
import { HostedImageProvider } from "./hosted";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const req = {
  prompt: "A gym",
  style: { palette: ["#000000"], fonts: ["Inter"] },
  needsLegibleText: false,
};

function fakeFetch(impl: () => Promise<Response>) {
  return impl as unknown as typeof fetch;
}

describe("HostedImageProvider", () => {
  it("decodes b64_json into bytes and reports the model", async () => {
    const provider = new HostedImageProvider("k", "imagen", {
      fetchFn: fakeFetch(async () =>
        new Response(JSON.stringify({ b64_json: PNG_B64 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    });
    const result = await provider.generateImage(req);
    expect(result.model).toBe("imagen-4-fast");
    expect(result.bytes.length).toBeGreaterThan(0);
  });

  it("maps a non-2xx response to ExternalServiceError (no raw body)", async () => {
    const provider = new HostedImageProvider("k", "imagen", {
      fetchFn: fakeFetch(async () => new Response("secret upstream detail", { status: 500 })),
    });
    await expect(provider.generateImage(req)).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE",
    });
    await expect(provider.generateImage(req)).rejects.not.toThrow(/secret upstream/);
  });

  it("maps missing image data to ExternalServiceError", async () => {
    const provider = new HostedImageProvider("k", "imagen", {
      fetchFn: fakeFetch(async () => new Response(JSON.stringify({}), { status: 200 })),
    });
    await expect(provider.generateImage(req)).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE",
    });
  });

  it("wraps a network throw as ExternalServiceError", async () => {
    const provider = new HostedImageProvider("k", "imagen", {
      fetchFn: fakeFetch(async () => {
        throw new Error("ECONNREFUSED");
      }),
    });
    await expect(provider.generateImage(req)).rejects.toMatchObject({
      code: "EXTERNAL_SERVICE",
    });
  });

  it("routes legible-text requests to a text-strong model", async () => {
    const provider = new HostedImageProvider("k", "imagen", {
      fetchFn: fakeFetch(async () => new Response(JSON.stringify({ image: PNG_B64 }), { status: 200 })),
    });
    const result = await provider.generateImage({ ...req, needsLegibleText: true });
    expect(result.model).toBe("ideogram-v3");
  });
});
