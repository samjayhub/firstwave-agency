import { describe, it, expect } from "vitest";
import { assertSameOrigin } from "./csrf";
import { ForbiddenError } from "@/lib/errors/app-error";

const allowed = "http://localhost:3000";
const reqWith = (headers: Record<string, string>) =>
  new Request("http://localhost:3000/api/x", { method: "POST", headers });

describe("assertSameOrigin", () => {
  it("allows a same-origin request", () => {
    expect(() => assertSameOrigin(reqWith({ origin: allowed }), allowed)).not.toThrow();
  });

  it("allows a request with no Origin header (non-browser / same-origin nav)", () => {
    expect(() => assertSameOrigin(reqWith({}), allowed)).not.toThrow();
  });

  it("rejects a cross-origin Origin", () => {
    expect(() =>
      assertSameOrigin(reqWith({ origin: "https://evil.example" }), allowed),
    ).toThrow(ForbiddenError);
  });

  it("rejects a cross-site Sec-Fetch-Site", () => {
    expect(() =>
      assertSameOrigin(reqWith({ "sec-fetch-site": "cross-site" }), allowed),
    ).toThrow(ForbiddenError);
  });

  it("allows same-origin / none Sec-Fetch-Site", () => {
    expect(() =>
      assertSameOrigin(reqWith({ "sec-fetch-site": "same-origin" }), allowed),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(reqWith({ "sec-fetch-site": "none" }), allowed),
    ).not.toThrow();
  });
});
