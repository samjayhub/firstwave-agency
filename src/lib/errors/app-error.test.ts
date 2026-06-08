import { describe, it, expect } from "vitest";
import {
  AppError,
  NotFoundError,
  ValidationError,
  isAppError,
  toClientError,
} from "./app-error";

describe("AppError", () => {
  it("derives httpStatus from the code", () => {
    expect(new NotFoundError().httpStatus).toBe(404);
    expect(new ValidationError().httpStatus).toBe(400);
  });

  it("subclasses are AppError instances and operational by default", () => {
    const err = new NotFoundError("client missing");
    expect(isAppError(err)).toBe(true);
    expect(err.code).toBe("NOT_FOUND");
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe("NotFoundError");
  });
});

describe("toClientError", () => {
  it("passes through operational AppErrors", () => {
    const out = toClientError(new ValidationError("email is required"));
    expect(out).toEqual({
      code: "VALIDATION",
      message: "email is required",
      status: 400,
    });
  });

  it("masks raw errors so internals never leak", () => {
    const out = toClientError(new Error("ECONNREFUSED postgres://secret@host"));
    expect(out.status).toBe(500);
    expect(out.code).toBe("INTERNAL");
    expect(out.message).not.toMatch(/postgres|secret|ECONNREFUSED/);
  });

  it("masks non-operational AppErrors", () => {
    const out = toClientError(
      new AppError("INTERNAL", "db pool exhausted", { isOperational: false }),
    );
    expect(out.message).toBe("An unexpected error occurred.");
  });
});
