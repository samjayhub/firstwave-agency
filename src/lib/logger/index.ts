// Structured JSON logger with automatic secret redaction. Business code logs
// through this — never `console.log` — so output is parseable and tokens /
// passwords are scrubbed before they can ever reach a log sink.

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

// Substrings (case-insensitive) of keys whose values must never be logged.
const REDACT_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "apikey",
  "api_key",
  "jwt",
  "cookie",
  "clientsecret",
];

const REDACTED = "[REDACTED]";

function shouldRedact(key: string): boolean {
  const k = key.toLowerCase();
  return REDACT_KEYS.some((needle) => k.includes(needle));
}

/** Deep-clone a value, replacing sensitive values with [REDACTED]. Cycle-safe. */
export function redact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => redact(v, seen));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = shouldRedact(k) ? REDACTED : redact(v, seen);
  }
  return out;
}

export type LogSink = (line: string) => void;

export interface LoggerOptions {
  level?: LogLevel;
  context?: Record<string, unknown>;
  sink?: LogSink;
  /** Injectable clock for deterministic tests. */
  clock?: () => string;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): Logger;
}

const defaultSink: LogSink = (line) => process.stdout.write(line + "\n");

export function createLogger(options: LoggerOptions = {}): Logger {
  const minWeight = LEVEL_WEIGHT[options.level ?? "info"];
  const sink = options.sink ?? defaultSink;
  const clock = options.clock ?? (() => new Date().toISOString());
  const context = options.context ?? {};

  function emit(level: LogLevel, msg: string, fields?: Record<string, unknown>) {
    if (LEVEL_WEIGHT[level] < minWeight) return;
    const record = {
      time: clock(),
      level,
      msg,
      ...(redact(context) as Record<string, unknown>),
      ...((redact(fields ?? {}) as Record<string, unknown>) ?? {}),
    };
    sink(JSON.stringify(record));
  }

  return {
    debug: (msg, fields) => emit("debug", msg, fields),
    info: (msg, fields) => emit("info", msg, fields),
    warn: (msg, fields) => emit("warn", msg, fields),
    error: (msg, fields) => emit("error", msg, fields),
    child: (childContext) =>
      createLogger({ ...options, context: { ...context, ...childContext } }),
  };
}

/** Default app logger. */
export const logger = createLogger({
  level: (process.env.LOG_LEVEL as LogLevel) || "info",
});
