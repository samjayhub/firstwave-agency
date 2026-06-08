import { describe, it, expect } from "vitest";
import { createLogger, redact } from "./index";

function capture() {
  const lines: string[] = [];
  return {
    lines,
    sink: (l: string) => lines.push(l),
    parsed: () => lines.map((l) => JSON.parse(l)),
  };
}

const fixedClock = () => "2026-06-08T00:00:00.000Z";

describe("redact", () => {
  it("scrubs sensitive keys at any depth", () => {
    const out = redact({
      accessToken: "abc",
      nested: { password: "p", apiKey: "k", ok: "keep" },
      list: [{ refreshToken: "r" }],
    }) as Record<string, unknown>;
    expect(out.accessToken).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).password).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).apiKey).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).ok).toBe("keep");
  });

  it("is cycle-safe", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(() => redact(a)).not.toThrow();
  });
});

describe("createLogger", () => {
  it("filters messages below the configured level", () => {
    const c = capture();
    const log = createLogger({ level: "warn", sink: c.sink, clock: fixedClock });
    log.info("ignored");
    log.error("kept");
    expect(c.lines).toHaveLength(1);
    expect(c.parsed()[0].msg).toBe("kept");
  });

  it("emits structured records and redacts fields", () => {
    const c = capture();
    const log = createLogger({ level: "info", sink: c.sink, clock: fixedClock });
    log.info("login", { userId: "u1", password: "hunter2" });
    const rec = c.parsed()[0];
    expect(rec).toMatchObject({
      time: "2026-06-08T00:00:00.000Z",
      level: "info",
      msg: "login",
      userId: "u1",
      password: "[REDACTED]",
    });
  });

  it("merges context from child loggers", () => {
    const c = capture();
    const log = createLogger({ sink: c.sink, clock: fixedClock }).child({
      agencyId: "ag1",
    });
    log.info("scoped");
    expect(c.parsed()[0].agencyId).toBe("ag1");
  });
});
