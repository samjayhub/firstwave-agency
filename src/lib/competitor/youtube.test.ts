import { describe, it, expect } from "vitest";
import { parseChannelRef, parseDurationSeconds } from "./youtube";
import { ExternalServiceError } from "@/lib/errors/app-error";

describe("parseChannelRef", () => {
  it("parses handle, channel-id, user, and bare-handle URLs", () => {
    expect(parseChannelRef("https://youtube.com/@creator")).toEqual({ type: "handle", value: "creator" });
    expect(parseChannelRef("https://www.youtube.com/channel/UC123")).toEqual({ type: "id", value: "UC123" });
    expect(parseChannelRef("https://youtube.com/user/legacy")).toEqual({ type: "user", value: "legacy" });
    expect(parseChannelRef("https://youtube.com/c/vanity")).toEqual({ type: "user", value: "vanity" });
    expect(parseChannelRef("@bare")).toEqual({ type: "handle", value: "bare" });
  });

  it("rejects unrecognised URLs", () => {
    expect(() => parseChannelRef("https://youtube.com/watch?v=abc")).toThrow(ExternalServiceError);
  });
});

describe("parseDurationSeconds", () => {
  it("converts ISO-8601 durations to seconds", () => {
    expect(parseDurationSeconds("PT45S")).toBe(45);
    expect(parseDurationSeconds("PT1M5S")).toBe(65);
    expect(parseDurationSeconds("PT1H2M3S")).toBe(3723);
    expect(parseDurationSeconds("PT0S")).toBe(0);
    expect(parseDurationSeconds("garbage")).toBe(0);
  });
});
