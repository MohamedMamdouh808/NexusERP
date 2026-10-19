import { describe, expect, it } from '@jest/globals';
import { ConfigurationError, assertPortIsAvailable, loadConfiguration } from '../configuration';

/**
 * FR-009: a port conflict or a missing required configuration value MUST fail startup
 * with a message naming the cause. A generic "invalid configuration" gives a developer
 * nothing to act on.
 */

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  LOG_LEVEL: 'info',
  CORS_ORIGINS: 'http://localhost:5173',
} satisfies Record<string, string>;

describe('loadConfiguration', () => {
  it('returns a usable configuration from a valid environment', () => {
    const config = loadConfiguration(validEnv);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('info');
    expect(config.corsOrigins).toEqual(['http://localhost:5173']);
    expect(config.isProduction).toBe(false);
  });

  it('names the missing variable in the failure message', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = validEnv;
    const error = catchConfigurationError(() => loadConfiguration(withoutDatabase));
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.message).toContain('DATABASE_URL');
    expect(error.variableName).toBe('DATABASE_URL');
  });

  it('refuses to start with DATABASE_URL absent rather than serving half-configured (FR-031, SC-008)', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabase } = validEnv;
    const error = catchConfigurationError(() => loadConfiguration(withoutDatabase));

    expect(error).toBeInstanceOf(ConfigurationError);
    expect(error.variableName).toBe('DATABASE_URL');
    // The message tells the reader what to do, not merely that something is wrong: a
    // service that started here would answer requests against a database it never
    // reached, and the failure would surface as every query failing rather than as a
    // refusal to start.
    expect(error.message).toContain('.env.example');
  });

  it('refuses a present-but-empty DATABASE_URL, because that is still unconfigured (FR-031)', () => {
    const error = catchConfigurationError(() => loadConfiguration({ ...validEnv, DATABASE_URL: '' }));

    expect(error.variableName).toBe('DATABASE_URL');
    expect(error.message).toContain('must not be empty');
  });

  it('names the variable when its value is invalid, not just its type', () => {
    const error = catchConfigurationError(() =>
      loadConfiguration({ ...validEnv, DATABASE_URL: 'mysql://user@localhost/db' }),
    );
    expect(error.message).toContain('DATABASE_URL');
    expect(error.message).toContain('postgresql://');
  });

  it('names the variable when the port is not a positive integer', () => {
    const error = catchConfigurationError(() => loadConfiguration({ ...validEnv, PORT: '0' }));
    expect(error.message).toContain('PORT');
  });

  it('names the variable when the log level is not recognised', () => {
    const error = catchConfigurationError(() => loadConfiguration({ ...validEnv, LOG_LEVEL: 'loud' }));
    expect(error.message).toContain('LOG_LEVEL');
  });

  it('rejects a wildcard CORS origin, because it would allow any origin to send cookies', () => {
    const error = catchConfigurationError(() =>
      loadConfiguration({ ...validEnv, CORS_ORIGINS: '*' }),
    );
    expect(error.message).toContain('CORS_ORIGINS');
    expect(error.message).toContain('explicit allowlist');
  });

  it('rejects an empty CORS allowlist', () => {
    const error = catchConfigurationError(() => loadConfiguration({ ...validEnv, CORS_ORIGINS: '  ' }));
    expect(error.message).toContain('CORS_ORIGINS');
  });

  it('splits a multi-origin allowlist and trims whitespace', () => {
    const config = loadConfiguration({
      ...validEnv,
      CORS_ORIGINS: 'http://localhost:5173, https://app.example ',
    });
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'https://app.example']);
  });

  it('flags production mode from the environment', () => {
    expect(loadConfiguration({ ...validEnv, NODE_ENV: 'production' }).isProduction).toBe(true);
  });

  it('never includes a secret in the error message', () => {
    const error = catchConfigurationError(() =>
      loadConfiguration({ ...validEnv, PORT: 'not-a-port', DATABASE_URL: 'super-secret-url' }),
    );
    expect(error.message).not.toContain('super-secret-url');
  });
});

describe('assertPortIsAvailable', () => {
  it('resolves for a free port', async () => {
    await expect(assertPortIsAvailable(0)).resolves.toBeUndefined();
  });

  it('names the port when it is already bound (FR-009)', async () => {
    const net = await import('node:net');
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    try {
      const error = await catchAsyncConfigurationError(() => assertPortIsAvailable(port, '127.0.0.1'));
      expect(error).toBeInstanceOf(ConfigurationError);
      expect(error.message).toContain(String(port));
      expect(error.message).toContain('already in use');
      expect(error.variableName).toBe('PORT');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

function catchConfigurationError(run: () => unknown): ConfigurationError {
  try {
    run();
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error('Expected loadConfiguration to throw, but it returned');
}

async function catchAsyncConfigurationError(
  run: () => Promise<unknown>,
): Promise<ConfigurationError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error('Expected assertPortIsAvailable to reject, but it resolved');
}