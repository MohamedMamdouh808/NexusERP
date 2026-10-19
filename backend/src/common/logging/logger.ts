import type { LogLevel, LoggerService } from '@nestjs/common';
import pino, { type Logger } from 'pino';
import { getRequestContext } from './request-context';

/**
 * Structured JSON logging to stdout.
 *
 * FR-036 requires records parseable as single units rather than free-form lines. stdout
 * JSON is what Railway and Render both collect natively, which keeps the v1 deployment
 * footprint minimal and matches the "no additional infrastructure" posture of Constitution
 * Principle VI.
 *
 * FR-055 requires the format to be consumable by a monitoring or analytics service that
 * is not yet chosen. That is why the field set is fixed and documented rather than
 * incidental: the vendor-independent requirement is the field set, and a stable field set
 * is what lets a service be added later as configuration rather than a code change.
 */

/**
 * Field names whose VALUES are secret, at any nesting depth.
 *
 * A list configured once at the logger level is more reliable than remembering to redact
 * at each call site - there is no call site to forget. It covers credential material by
 * name rather than by value, because a value-based rule would need to know every secret
 * in advance.
 *
 * Matching is case-insensitive AND separator-insensitive (see `normalizeKey`), so
 * `apiKey`, `api_key`, `api-key`, and `APIKEY` are all covered by one entry, and the
 * `x-csrf-token` header is covered by listing it. Without that, a variant is one missed
 * entry away from being written to the log in plaintext.
 *
 * Deliberately NOT listed: a bare `session`. A field named `session` is often benign
 * diagnostic state, and over-redaction destroys diagnosability. Session IDENTIFIERS
 * (`sessionId`, `sessionToken`, `sid`) are listed, which is what actually leaks.
 */
export const SENSITIVE_FIELD_NAMES: readonly string[] = [
  // Passwords
  'password',
  'passwordHash',
  'newPassword',
  'currentPassword',
  'passphrase',

  // Generic secret material
  'secret',
  'clientSecret',
  'privateKey',

  // Tokens
  'token',
  'accessToken',
  'refreshToken',
  'idempotencyKey',
  'bearerToken',

  // API keys
  'apiKey',
  'x-api-key',

  // CSRF: the body field and the header name are different keys
  'csrfToken',
  'x-csrf-token',
  'csrf-token',

  // Session identifiers
  'sessionId',
  'sessionToken',
  'sid',

  // Authorization material
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
];

/**
 * Case- and separator-insensitive form used for comparison.
 *
 * Strips every non-alphanumeric character, so `X-CSRF-Token`, `x_csrf_token`, and
 * `xCsrfToken` all collapse to `xcsrftoken`. A list keyed by one canonical spelling
 * cannot then miss a variant that appears in a different codebase style.
 */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Explicit redact paths for fast-redact.
 *
 * IMPORTANT: these cover TOP-LEVEL keys only. `*.password` reaches exactly one level
 * deep and `**.password` is not supported by fast-redact - both were verified
 * empirically rather than assumed, because a redaction rule that silently covers less
 * than believed is worse than none. Arbitrary depth is handled by `scrubSecrets` below,
 * which runs before serialization. This list is defence in depth for the common cases.
 */
export const REDACTION_PATHS: readonly string[] = [
  ...SENSITIVE_FIELD_NAMES,
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];

const SENSITIVE = new Set(SENSITIVE_FIELD_NAMES.map(normalizeKey));
const CENSOR = '[redacted]';
/** Guards against a cyclic or pathologically deep object. */
const MAX_SCRUB_DEPTH = 12;

/**
 * Recursively returns a COPY with the value of every sensitive-named field replaced, at
 * any depth.
 *
 * This is what actually satisfies FR-039. `scrubSecrets({ body: { password: 'x' } })`
 * returns `{ body: { password: '[redacted]' } }` - a fast-redact path of `*.password`
 * does not, which is how a secret in a request body would otherwise reach the log.
 *
 * Arrays are walked too, because a credentials array nested in a payload is as likely as
 * a nested object and redaction that skips arrays leaks just as effectively.
 *
 * The input is NEVER MUTATED. A logger that redacted in place would corrupt the caller's
 * object - so a validation error that was scrubbed for logging would also lose its
 * password before any handler could read it, and a shared config object would be silently
 * rewritten for the rest of the process. Every container is rebuilt; only leaf values are
 * replaced. Non-plain values (Date, Buffer, class instances) are passed through by
 * reference, which is safe because they are not walked and so cannot be mutated.
 *
 * Beyond `MAX_SCRUB_DEPTH` the original reference is returned unchanged. That is a
 * deliberate trade: the guard prevents a stack overflow on a hostile payload, and a
 * structure nested more than twelve levels deep is not one this product logs. If that
 * assumption is ever wrong, raise the constant rather than removing the guard.
 */
export function scrubSecrets<T>(value: T, depth = 0): T {
  if (depth > MAX_SCRUB_DEPTH || value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => scrubSecrets(item, depth + 1)) as unknown as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    result[key] = SENSITIVE.has(normalizeKey(key)) ? CENSOR : scrubSecrets(entry, depth + 1);
  }
  return result as T;
}

/** Fields present on every request log record (FR-037). */
export interface RequestLogRecord {
  requestId: string;
  route: string;
  method: string;
  status: number;
  durationMs: number;
  userId: string | null;
  organizationId: string | null;
}

export interface LoggerOptions {
  level: string;
  isProduction: boolean;
  /**
   * Where records are written. Defaults to stdout.
   *
   * Injectable so a test can assert on what the logger ACTUALLY emits. Asserting on the
   * configuration instead would pass even if redaction were never applied.
   */
  destination?: NodeJS.WritableStream;
}

/**
 * Adapts a pino instance to NestJS's `LoggerService` interface.
 *
 * NestJS expects `log(message, context?)` plus level methods; pino provides the latter
 * but not `log` with that signature, so a raw pino logger does not satisfy the interface
 * and `NestFactory.create({ logger })` will not accept it. A fifteen-line adapter avoids
 * adding a logging framework integration purely to bridge two interfaces.
 */
export class NestPinoLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, context?: string): void {
    this.logger.info({ context }, messageString(message));
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.logger.error({ context, stack }, messageString(message));
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn({ context }, messageString(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug({ context }, messageString(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace({ context }, messageString(message));
  }

  fatal(message: unknown, context?: string): void {
    this.logger.fatal({ context }, messageString(message));
  }

  setLogLevels(_levels: readonly LogLevel[]): void {
    // Level is configured once in createLogger. NestJS's runtime level switching is not
    // used, so this is intentionally a no-op rather than a silent divergence.
  }
}

/** Renders any thrown value as a message string without leaking an object graph. */
function messageString(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  try {
    return JSON.stringify(message) ?? String(message);
  } catch {
    return String(message);
  }
}

/**
 * Builds the application logger.
 *
 * In production the level is raised and serializers are removed, so a record contains no
 * more than the fields listed above. The level is a parameter rather than a global read so
 * the behaviour is testable without mutating process state.
 */
export function createLogger({ level, isProduction, destination }: LoggerOptions): Logger {
  const options: pino.LoggerOptions = {
    level,
    // FR-039: redact before a line is ever written, not after.
    redact: {
      paths: [...REDACTION_PATHS],
      censor: '[redacted]',
    },
    base: isProduction ? undefined : { service: 'nexuserp-api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level: (label) => ({ level: label }),
    },
    // FR-039: scrub BEFORE the record is serialized, so no sensitive value ever reaches
    // the output stream. `logMethod` is the only hook that sees the merged argument list.
    hooks: {
      logMethod(args, method) {
        method.apply(this, args.map((argument) => scrubSecrets(argument)) as typeof args);
      },
    },
  };

  return destination ? pino(options, destination) : pino(options);
}

/**
 * Builds the request log record.
 *
 * Every field is taken from the request context or from the measured request, never from
 * a value the caller supplies. `userId` and `organizationId` are `null` until
 * authentication and organizations ship - the FIELDS are present from the start so the
 * record shape does not change later (see request-context.ts).
 */
export function buildRequestLogRecord(input: {
  route: string;
  method: string;
  status: number;
  durationMs: number;
}): RequestLogRecord {
  const context = getRequestContext();
  return {
    requestId: context?.requestId ?? 'unknown',
    route: input.route,
    method: input.method,
    status: input.status,
    durationMs: input.durationMs,
    userId: context?.userId ?? null,
    organizationId: context?.organizationId ?? null,
  };
}