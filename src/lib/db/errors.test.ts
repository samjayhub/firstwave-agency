import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { mapPrismaError, withDbErrors } from "./errors";
import { AppError } from "@/lib/errors/app-error";

function knownError(code: string) {
  return new Prisma.PrismaClientKnownRequestError("boom", {
    code,
    clientVersion: "5.0.0",
  });
}

describe("mapPrismaError", () => {
  it("maps P2025 to NOT_FOUND", () => {
    const e = mapPrismaError(knownError("P2025"), "Client");
    expect(e.code).toBe("NOT_FOUND");
    expect(e.isOperational).toBe(true);
  });

  it("maps P2002 to CONFLICT", () => {
    expect(mapPrismaError(knownError("P2002")).code).toBe("CONFLICT");
  });

  it("maps unknown codes to a masked, non-operational INTERNAL error", () => {
    const e = mapPrismaError(knownError("P9999"));
    expect(e.code).toBe("INTERNAL");
    expect(e.isOperational).toBe(false);
  });

  it("maps arbitrary errors to a masked INTERNAL error", () => {
    const e = mapPrismaError(new Error("raw db connection string leaked"));
    expect(e.code).toBe("INTERNAL");
    expect(e.isOperational).toBe(false);
  });
});

describe("withDbErrors", () => {
  it("passes through existing AppErrors unchanged", async () => {
    const original = new AppError("FORBIDDEN", "nope");
    await expect(
      withDbErrors(() => Promise.reject(original)),
    ).rejects.toBe(original);
  });

  it("wraps raw failures as mapped AppErrors", async () => {
    await expect(
      withDbErrors(() => Promise.reject(knownError("P2002")), "Client"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
