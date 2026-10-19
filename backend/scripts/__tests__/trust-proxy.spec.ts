import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { ConfigurationError, loadConfiguration } from '../../src/config/configuration';

/**
 * `backend/scripts/__tests__/` sits three directories below the repository root, so the
 * root is three levels up.
 */
const repoRoot = resolve(__dirname, '..', '..', '..');

/**
 * Proxy trust is an authority decision, not a convenience (research.md R-006).
 *
 * Express derives the client's address and protocol from the socket by default. Behind a
 * proxy those are the proxy's, so a rate limiter or an audit row would record the wrong
 * caller - which is why trust is needed at all. But trusting a header a client can supply
 * is how a caller invents its own address, so the default must record the socket and the
 * setting must be explicit.
 */

const validEnv = {
  NODE_ENV: 'development',
  PORT: '3000',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  LOG_LEVEL: 'info',
  CORS_ORIGINS: 'http://localhost:5173',
} satisfies Record<string, string>;

function trustProxyError(value: string): ConfigurationError {
  try {
    loadConfiguration({ ...validEnv, TRUST_PROXY: value });
  } catch (error) {
    if (error instanceof ConfigurationError) return error;
    throw error;
  }
  throw new Error(`Expected TRUST_PROXY="${value}" to be rejected, but it was accepted`);
}

describe('TRUST_PROXY', () => {
  it('trusts nothing when the variable is absent, so a new environment fails closed', () => {
    expect(loadConfiguration(validEnv).trustProxy).toBe(false);
  });

  it('accepts an explicit false', () => {
    expect(loadConfiguration({ ...validEnv, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
  });

  it.each(['1', '2', '5'])('accepts %s as a hop count', (value) => {
    expect(loadConfiguration({ ...validEnv, TRUST_PROXY: value }).trustProxy).toBe(Number(value));
  });

  it.each(['true', '0', '-1', '1.5', 'yes', '', ' ', 'all'])(
    'rejects %p and names the variable',
    (value) => {
      const error = trustProxyError(value);
      expect(error.variableName).toBe('TRUST_PROXY');
      expect(error.message).toContain('TRUST_PROXY');
      // The message must say what was expected, so the fix is legible without the schema.
      expect(error.message).toContain('positive integer');
    },
  );

  it('is not gated on NODE_ENV, because staging sets NODE_ENV=production', () => {
    // A production gate would switch trust ON in the one environment the specification
    // says must have it configured explicitly, which is the opposite of failing closed.
    expect(loadConfiguration({ ...validEnv, NODE_ENV: 'production' }).trustProxy).toBe(false);
    expect(
      loadConfiguration({ ...validEnv, NODE_ENV: 'production', TRUST_PROXY: '1' }).trustProxy,
    ).toBe(1);
  });
});

describe('the bootstrap passes the configured value to Express', () => {
  const mainSource = readFileSync(join(repoRoot, 'backend', 'src', 'main.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  it('reads the setting from configuration rather than compiling a constant into the service', () => {
    expect(mainSource).toMatch(/app\.set\(\s*'trust proxy'\s*,\s*configuration\.trustProxy\s*\)/);
  });

  it('no longer hardcodes the setting', () => {
    expect(mainSource).not.toMatch(/app\.set\(\s*'trust proxy'\s*,\s*(?:false|true|\d+)\s*\)/);
  });
});
