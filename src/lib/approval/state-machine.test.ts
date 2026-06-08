import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, isTerminal } from "./state-machine";

describe("approval state machine", () => {
  it("allows the happy-path transitions", () => {
    expect(canTransition("draft", "in_review")).toBe(true);
    expect(canTransition("in_review", "approved")).toBe(true);
    expect(canTransition("approved", "scheduled")).toBe(true);
    expect(canTransition("scheduled", "published")).toBe(true);
  });

  it("permits send-back and failure paths", () => {
    expect(canTransition("in_review", "draft")).toBe(true);
    expect(canTransition("scheduled", "failed")).toBe(true);
    expect(canTransition("failed", "scheduled")).toBe(true);
  });

  it("forbids skipping the approval gate", () => {
    // draft can't jump straight to scheduled/published
    expect(canTransition("draft", "scheduled")).toBe(false);
    expect(canTransition("draft", "published")).toBe(false);
    expect(canTransition("in_review", "scheduled")).toBe(false);
    expect(canTransition("approved", "published")).toBe(false);
  });

  it("treats published as terminal", () => {
    expect(isTerminal("published")).toBe(true);
    expect(canTransition("published", "draft")).toBe(false);
  });

  it("assertTransition throws ConflictError on an illegal move", () => {
    expect(() => assertTransition("draft", "published")).toThrow();
    expect(() => assertTransition("approved", "scheduled")).not.toThrow();
  });
});
