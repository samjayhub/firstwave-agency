// Structured JSON logger with automatic secret redaction. Business code logs
// through this — never `console.log` — so output is parseable and tokens /
// passwords are scrubbed before they can ever reach a log sink.
//
// Two layers of protection:
//   - redact(): scrubs values by KEY name (password, token, ...).
//   - scrubSecrets(): scrubs secrets that live inside a string VALUE (bearer
//     tokens, URLs with credentials, JWTs, provider keys) — used for free-text
//     like exception messages where the key ("error") isn't itself sensitive.

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
  "passwd",
  "pwd",
  "secret",
  "clientsecret",
  "token", // covers access_token, refreshToken, bearer token, etc.
  "authorization",
  "bearer",
  "apikey",
  "api_key",
  "jwt",
  "cookie", // covers set-cookie
  "credential", // covers credentials
  "private_key",
  "privatekey",
  "session",
  "sessionid",
  "sid",
  "signature",
  "salt",
  "otp",
  "mfa",
];

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 12;

function shouldRedact(key: string): boolean {
  const k = key.toLowerCase();
  return REDACT_KEYS.some((needle) => k.includes(needle));
}

/** Deep-clone a value, replacing sensitive values with [REDACTED]. Cycle- and depth-safe. */
export function redact(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[Truncated]";
  if (seen.has(value as object)) return "[Circular]";
  seen.add(value as object);

  if (Array.isArray(value)) return value.map((v) => redact(v, seen, depth + 1));

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = shouldRedact(k) ? REDACTED : redact(v, seen, depth + 1);
  }
  return out;
}

// Value-level secret patterns. All linear (no nested quantifiers) → no ReDoS.
const VALUE_PATTERNS: Array<[RegExp, string]> = [
  [/(bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]"],
  // URLs embedding credentials: scheme://user:pass@host
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s:@/]+:[^\s:@/]+@/gi, "$1[REDACTED]@"],
  // JWTs
  [/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[REDACTED_JWT]"],
  // Common provider key prefixes
  [/\b(sk-ant-[A-Za-z0-9-]+|sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]+)\b/g, "[REDACTED]"],
  // Long opaque base64-ish runs (token-like)
  [/\b[A-Za-z0-9+/]{32,}={0,2}\b/g, "[REDACTED]"],
];

/** Scrub secrets embedded inside free-text (e.g. an exception message). */
export function scrubSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    out = out.replace(pattern, replacement);
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
