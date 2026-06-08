import { describe, it, expect } from "vitest";
import { InMemoryRateLimiter } from "./rate-limiter";

describe("InMemoryRateLimiter", () => {
  it("allows up to the limit, then blocks with a retry hint", async () => {
    let t = 0;
    const rl = new InMemoryRateLimiter(2, 1000, () => t);
    expect((await rl.consume("k")).allowed).toBe(true);
    expect((await rl.consume("k")).allowed).toBe(true);
    const third = await rl.consume("k");
    expect(third.allowed).toBe(false);
    expect(third.retryAfterMs).toBeGreaterThan(0);
  });

  it("recovers once the window slides past old hits", async () => {
    let t = 0;
    const rl = new InMemoryRateLimiter(1, 1000, () => t);
    expect((await rl.consume("k")).allowed).toBe(true);
    expect((await rl.consume("k")).allowed).toBe(false);
    t = 1001;
    expect((await rl.consume("k")).allowed).toBe(true);
  });

  it("tracks keys independently", async () => {
    const t = 0;
    const rl = new InMemoryRateLimiter(1, 1000, () => t);
    expect((await rl.consume("a")).allowed).toBe(true);
    expect((await rl.consume("b")).allowed).toBe(true);
  });
});
