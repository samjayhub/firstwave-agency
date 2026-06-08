// Application error model. Every error surfaced to a client goes through
// `toClientError`, which guarantees we never leak raw DB / internal messages —
// only a stable code + safe message + HTTP status. Internal modules throw the
// typed subclasses below; the boundary (route handlers) maps them.

export type ErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "EXTERNAL_SERVICE"
  | "INTERNAL";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  EXTERNAL_SERVICE: 502,
  INTERNAL: 500,
};

export interface AppErrorOptions {
  /** Operational errors are safe to show the client; non-operational are masked. */
  isOperational?: boolean;
  /** Structured, non-sensitive context for logs (never returned to the client). */
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly isOperational: boolean;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = STATUS_BY_CODE[code];
    this.isOperational = options.isOperational ?? true;
    this.details = options.details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", options?: AppErrorOptions) {
    super("VALIDATION", message, options);
  }
}
export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required", options?: AppErrorOptions) {
    super("UNAUTHORIZED", message, options);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "Not allowed", options?: AppErrorOptions) {
    super("FORBIDDEN", message, options);
  }
}
export class NotFoundError extends AppError {
  constructor(message = "Not found", options?: AppErrorOptions) {
    super("NOT_FOUND", message, options);
  }
}
export class ConflictError extends AppError {
  constructor(message = "Conflict", options?: AppErrorOptions) {
    super("CONFLICT", message, options);
  }
}
export class ExternalServiceError extends AppError {
  constructor(message = "Upstream service failed", options?: AppErrorOptions) {
    super("EXTERNAL_SERVICE", message, options);
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export interface ClientError {
  code: ErrorCode;
  message: string;
  status: number;
}

/**
 * Map any thrown value to a safe client-facing shape. Operational AppErrors pass
 * their code/message through; everything else (raw Error, Prisma error, string,
 * non-operational AppError) collapses to a generic 500 so internals never leak.
 */
export function toClientError(err: unknown): ClientError {
  if (isAppError(err) && err.isOperational) {
    return { code: err.code, message: err.message, status: err.httpStatus };
  }
  return {
    code: "INTERNAL",
    message: "An unexpected error occurred.",
    status: STATUS_BY_CODE.INTERNAL,
  };
}
