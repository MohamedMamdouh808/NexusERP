#!/usr/bin/env node
/**
 * Shared DATABASE_URL parsing for the database guard scripts.
 *
 * Guards must be able to report WHICH database they are pointed at without
 * ever printing credentials. Host and database name are safe to print; the
 * password is always rendered as [redacted]; the username is printed because
 * it carries the project ref that EXPECTED_DATABASE_REF is checked against.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const repoRoot = resolve(__dirname, '..', '..');
const envPath = join(repoRoot, '.env');

/** Minimal .env parser (same contract as the previous inline copies). */
export function parseEnvFile(contents: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separator = withoutExport.indexOf('=');
    if (separator <= 0) continue;

    const key = withoutExport.slice(0, separator).trim();
    let value = withoutExport.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/** Reads a value from the process environment, falling back to the root .env. */
export function readEnvValue(key: string): string | undefined {
  const fromProcess = process.env[key];
  if (fromProcess !== undefined) return fromProcess;
  if (!existsSync(envPath)) return undefined;
  return parseEnvFile(readFileSync(envPath, 'utf8'))[key];
}

export interface DatabaseTarget {
  username: string | null;
  host: string | null;
  database: string | null;
  schema: string | null;
  /** Full URL with the password replaced by [redacted]. Safe to print. */
  maskedUrl: string | null;
}

export function parseDatabaseUrl(url: string): DatabaseTarget {
  const match = url.match(/^postgres(?:ql)?:\/\/([^:@/]+)(?::[^@]*)?@([^:/\s]+)(?::\d+)?\/([^?\s]+)(\?[^\s]*)?/);
  const searchParams = match?.[5] ? new URLSearchParams(match[5]) : new URLSearchParams();
  return {
    username: match?.[1] ?? null,
    host: match?.[2] ?? null,
    database: match?.[3] ?? null,
    schema: searchParams.get('schema') ?? null,
    maskedUrl: url.replace(/(postgres(?:ql)?:\/\/[^:]+:)[^@]*@/, '$1[redacted]@'),
  };
}

/** Returns a copy of the URL with the schema query parameter replaced or added. */
export function replaceSchema(url: string, schema: string): string {
  const hasQuery = url.includes('?');
  const existingSchema = url.match(/[?&]schema=[^&]*/);
  if (existingSchema) {
    return url.replace(existingSchema[0], `schema=${schema}`);
  }
  const separator = hasQuery ? '&' : '?';
  return `${url}${separator}schema=${schema}`;
}

/** Returns true when the URL targets the public schema (no schema param means public). */
export function isPublicSchema(url: string): boolean {
  const schemaMatch = url.match(/[?&]schema=([^&]*)/);
  return schemaMatch === null || schemaMatch[1] === 'public';
}

/** Local development hostnames that are always allowed. */
const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

export function isLocalHost(host: string | null): boolean {
  return host !== null && LOCAL_HOSTS.includes(host);
}

/** Loads DATABASE_URL and parses it; null when not configured. */
export function loadDatabaseTarget(): null | { target: DatabaseTarget; url: string } {
  const url = readEnvValue('DATABASE_URL');
  if (!url) return null;
  return { target: parseDatabaseUrl(url), url };
}

/**
 * Returns null when the hosted-database project ref checks out, otherwise a
 * reason string. Local databases are exempt — their usernames have no ref.
 */
export function databaseRefMismatch(target: DatabaseTarget): string | null {
  if (isLocalHost(target.host)) return null;

  const expected = readEnvValue('EXPECTED_DATABASE_REF');
  if (!expected) {
    return (
      'EXPECTED_DATABASE_REF is not set. Set it to the Supabase project ref that must appear ' +
      'in the DATABASE_URL username (postgres.<ref>).'
    );
  }
  if (!target.username) {
    return `could not read the username from DATABASE_URL (masked: ${target.maskedUrl}).`;
  }
  if (!target.username.includes(expected)) {
    return (
      `DATABASE_URL username "${target.username}" does not contain the expected project ref ` +
      `"${expected}" (masked URL: ${target.maskedUrl}).`
    );
  }
  return null;
}
