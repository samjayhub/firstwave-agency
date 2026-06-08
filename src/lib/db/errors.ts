// Map Prisma/runtime DB errors to AppError so raw DB errors never reach a client.
// Known Prisma error codes get a meaningful operational AppError; anything else
// collapses to a non-operational INTERNAL error (masked by toClientError).
import { Prisma } from "@prisma/client";
import {
  AppError,
  ConflictError,
  NotFoundError,
  type AppErrorOptions,
} from "@/lib/errors/app-error";

export function mapPrismaError(err: unknown, context?: string): AppError {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const details: AppErrorOptions = {
      details: { prismaCode: err.code, context },
      cause: err,
    };
    switch (err.code) {
      case "P2025": // record not found for the operation
        return new NotFoundError(context ? `${context} not found` : "Not found", details);
      case "P2002": // unique constraint violation
        return new ConflictError(
          context ? `${context} already exists` : "Already exists",
          details,
        );
      case "P2003": // foreign key constraint failed
        return new AppError("VALIDATION", "Related record is invalid or missing.", details);
      default:
        return new AppError("INTERNAL", "A database error occurred.", {
          ...details,
          isOperational: false,
        });
    }
  }
  if (err instanceof Prisma.PrismaClientValidationError) {
    return new AppError("INTERNAL", "A database query was malformed.", {
      isOperational: false,
      cause: err,
      details: { context },
    });
  }
  return new AppError("INTERNAL", "An unexpected database error occurred.", {
    isOperational: false,
    cause: err,
    details: { context },
  });
}

/** Run a DB operation and rethrow any failure as a mapped AppError. */
export async function withDbErrors<T>(
  fn: () => Promise<T>,
  context?: string,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw mapPrismaError(err, context);
  }
}
