import { describe, it, expect } from "vitest";
import { extractJsonObject, extractJsonArray } from "./json";

describe("extractJsonObject", () => {
  it("parses an object out of surrounding prose", () => {
    expect(extractJsonObject('here: {"a":1} done')).toEqual({ a: 1 });
  });
  it("throws when there is no object", () => {
    expect(() => extractJsonObject("nope")).toThrow();
  });
});

describe("extractJsonArray", () => {
  it("parses a fenced array", () => {
    expect(extractJsonArray("```json\n[1, 2, 3]\n```")).toEqual([1, 2, 3]);
  });
  it("throws when the JSON is not an array", () => {
    expect(() => extractJsonArray('{"a":1}')).toThrow();
  });
  it("throws when there is no array", () => {
    expect(() => extractJsonArray("no array here")).toThrow();
  });
});
