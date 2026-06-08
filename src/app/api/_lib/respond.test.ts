import { describe, it, expect } from "vitest";
import { ok, fail } from "./respond";
import { NotFoundError } from "@/lib/errors/app-error";

describe("respond.ok", () => {
  it("returns JSON with the given status", async () => {
    const res = ok({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ a: 1 });
  });
});

describe("respond.fail", () => {
  it("maps an operational AppError to its safe shape", async () => {
    const res = fail(new NotFoundError("Client not found"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Client not found" },
    });
  });

  it("masks a raw error as a generic 500 (no internals leak)", async () => {
    const res = fail(new Error("postgres exploded with a secret connstring"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).not.toMatch(/postgres|secret/);
  });
});
