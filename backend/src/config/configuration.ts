import { z } from 'zod';

/**
 * Startup configuration.
 *
 * FR-009 and the specification's Edge Cases require the service to fail at startup
 * with a message NAMING the cause - the missing variable, the invalid value, or the
 * port already in use - rather than starting in a broken state and failing later at a
 * point that no longer identifies the cause.
 *
 * A raw `process.env` read is never used directly in application code. Every consumer
 * goes through `loadConfiguration()`, so an unvalidated value cannot reach a module.
 */

/** Thrown when configuration is unusable. The message always names the cause. */
export class ConfigurationError extends Error {
  readonly variableName: string | undefined;

  constructor(message: string, variableName?: string) {
    super(message);
    this.name = 'ConfigurationError';
    this.variableName = variableName;
  }
}

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(3000),
  DATABASE_URL: z
    .string()
    .min(1, 'must not be empty')
    .refine((value) => value.startsWith('postgresql://') || value.startsWith('postgres://'), {
      message: 'must be a PostgreSQL connection string beginning with postgresql://',
    }),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Defaults to trusting nothing. Behind a proxy the socket address is the proxy's, so
  // trusting the hop count is what lets the service see the real caller - but trusting a
  // header a caller can supply is how the caller invents its address. The default
  // therefore records the socket, and an environment that needs trust states it explicitly.
  TRUST_PROXY: z
    .string()
    .default('false')
    .refine((value) => value === 'false' || /^[1-9]\d*$/.test(value), {
      message: "must be 'false' or a positive integer hop count",
    }),
  SESSION_SECRET: z.string().min(16).optional(),
  CSRF_SECRET: z.string().min(16).optional(),
});

export type Environment = z.infer<typeof environmentSchema>;

export interface Configuration {
  readonly nodeEnv: Environment['NODE_ENV'];
  readonly port: number;
  readonly databaseUrl: string;
  readonly logLevel: Environment['LOG_LEVEL'];
  /** Explicit allowlist. A wildcard is rejected: an open CORS policy negates cookies. */
  readonly corsOrigins: readonly string[];
  /**
   * How many forwarding-proxy hops to trust when deriving the client's address and
   * protocol. `false` trusts nothing and records the socket address; a positive integer
   * trusts that many hops (FR-007).
   */
  readonly trustProxy: false | number;
  readonly sessionSecret: string | undefined;
  readonly csrfSecret: string | undefined;
  readonly isProduction: boolean;
}

/**
 * Validates the environment, naming the offending variable on failure.
 *
 * Zod reports every issue at once with a path, which is mapped here into a single
 * message that names each variable rather than saying only "invalid environment".
 */
export function loadConfiguration(source: NodeJS.ProcessEnv = process.env): Configuration {
  const parsed = environmentSchema.safeParse(source);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => {
        const variable = String(issue.path[0] ?? 'environment');
        return `${variable}: ${issue.message}`;
      })
      .join('; ');
    throw new ConfigurationError(
      `Invalid configuration - ${problems}. Check your .env file against .env.example.`,
      String(parsed.error.issues[0]?.path[0] ?? ''),
    );
  }

  const env = parsed.data;

  const corsOrigins = env.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (corsOrigins.includes('*')) {
    throw new ConfigurationError(
      'Invalid configuration - CORS_ORIGINS must be an explicit allowlist; "*" would allow any ' +
        'origin to send credentialed requests and is rejected.',
      'CORS_ORIGINS',
    );
  }

  if (corsOrigins.length === 0) {
    throw new ConfigurationError(
      'Invalid configuration - CORS_ORIGINS must list at least one origin.',
      'CORS_ORIGINS',
    );
  }

  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    logLevel: env.LOG_LEVEL,
    corsOrigins,
    trustProxy: env.TRUST_PROXY === 'false' ? false : Number(env.TRUST_PROXY),
    sessionSecret: env.SESSION_SECRET,
    csrfSecret: env.CSRF_SECRET,
    isProduction: env.NODE_ENV === 'production',
  };
}

/**
 * Verifies the port is free and returns a message naming it when it is not.
 *
 * FR-009: an occupied port must fail startup with a message naming the port, not an
 * unexplained crash. `EADDRINUSE` is otherwise surfaced as a bare stack trace, which
 * tells a developer nothing about which of their services is in the way.
 */
export async function assertPortIsAvailable(port: number, host = '0.0.0.0'): Promise<void> {
  const net = await import('node:net');

  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();

    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new ConfigurationError(
            `Port ${port} is already in use. Stop the process using it or set a different PORT ` +
              `in your .env file.`,
            'PORT',
          ),
        );
        return;
      }
      reject(error);
    });

    server.once('listening', () => {
      server.close(() => resolve());
    });

    server.listen(port, host);
  });
}