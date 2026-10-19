#!/usr/bin/env node
/**
 * Repository secret scan (FR-030, SC-006).
 *
 * Walks the repository's TRACKED files and reports anything that looks like a credential.
 * Runnable with no arguments and no `npm ci` - it uses only Node built-ins - so it exists
 * the moment this file does rather than depending on a scanner being installed. The
 * pipeline runs the same command (`node scripts/check-secrets.mjs`), so what CI checks is
 * exactly what a reader can run.
 *
 * ---------------------------------------------------------------------------------
 * Pattern set (explicit, and deliberately short)
 * ---------------------------------------------------------------------------------
 *   1. provider-prefixed keys     - `sk-…`, `ghp_…`, `github_pat_…`, `xox?-…`, `AKIA…`,
 *                                   `AIza…`, and a three-part JWT (`eyJ….….…`)
 *   2. private-key blocks         - `-----BEGIN … PRIVATE KEY-----`
 *   3. connection strings         - `scheme://user:password@host` for the schemes this
 *      carrying a password          project actually uses, where the password is a
 *                                   LITERAL
 *   4. long high-entropy tokens   - 40+ characters of base64/hex-ish text containing an
 *                                   uppercase letter, a lowercase letter, and a digit
 *
 * ---------------------------------------------------------------------------------
 * What pattern 3 deliberately does NOT match, and why
 * ---------------------------------------------------------------------------------
 * The user part must be a literal (`[A-Za-z0-9._-]+`) and the password may not begin a
 * shell expansion (`$` is excluded). A value written as `${POSTGRES_PASSWORD:-…}` or
 * `$PG_PASSWORD` is a template, not a credential: the repository cannot leak a secret it
 * does not contain, and a scanner that flags every environment interpolation is a scanner
 * that gets switched off - which reports nothing for the wrong reason. A CORS origin, an
 * API URL, and a `.env.example` placeholder therefore pass on their merits rather than by
 * an exemption.
 *
 * A password containing a colon is likewise not matched, because a URI password cannot be
 * delimited unambiguously once `:` is allowed. That is a known limitation of a structural
 * scan and is stated rather than hidden.
 *
 * ---------------------------------------------------------------------------------
 * The allowlist
 * ---------------------------------------------------------------------------------
 * A scan that flags the placeholders FR-029 *requires* is a scan someone disables. So the
 * exact credential literals below are permitted where they appear - each is a documented
 * local-development or test placeholder, none is usable against any deployment, and a NEW
 * value is never covered by it. The list is keyed by the credential alone, not by a file
 * path, so allowlisting `user:pw` does not blind the scan to the rest of the file it sits
 * in.
 *
 * ---------------------------------------------------------------------------------
 * Exclusions
 * ---------------------------------------------------------------------------------
 * Lockfiles are skipped, and only lockfiles. Their `integrity` fields are content
 * checksums: high-entropy by construction, public, and present by the thousand, so a
 * finding there is noise rather than a secret.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Credential literals that are documented placeholders. Never add a real value here. */
const ALLOWED_CREDENTIALS = new Map([
  ['nexuserp:nexuserp_dev_password', 'the documented local development password (.env.example, README, the boot smoke test)'],
  ['nexuserp:nexuserp', 'the CI service-container credentials'],
  ['nexuserp:secret', 'a frontend fixture asserting that the error boundary redacts a connection string'],
  ['ci:ci', 'a fixture connection string in the root-env wrapper spec'],
  ['user:pass', 'a fixture connection string'],
  ['user:pw', 'a fixture connection string'],
  ['u:p', 'a fixture connection string in the log-redaction test'],
]);

/** Files whose contents are not scanned, each with the reason it is safe to skip. */
const EXCLUDED_PATHS = new Map([
  ['package-lock.json', 'dependency integrity hashes are public content checksums, high-entropy by construction'],
]);

const PATTERNS = [
  {
    name: 'provider-prefixed key',
    regex: new RegExp(
      [
        '\\bsk-[A-Za-z0-9]{16,}',
        '\\bgh[pousr]_[A-Za-z0-9]{20,}',
        '\\bgithub_pat_[A-Za-z0-9_]{20,}',
        '\\bxox[baprs]-[A-Za-z0-9-]{10,}',
        '\\bAKIA[0-9A-Z]{16}\\b',
        '\\bAIza[0-9A-Za-z_-]{35}\\b',
        '\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}',
      ].join('|'),
      'g',
    ),
  },
  {
    name: 'private key block',
    regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  },
  {
    name: 'connection string carrying a password',
    regex:
      /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/([A-Za-z0-9._-]+):([^\s"'`/@:$]+)@/g,
    credential: (match) => `${match[1]}:${match[2]}`,
  },
  {
    name: 'long high-entropy token',
    regex: /[A-Za-z0-9+_-]{40,}/g,
    // Random-looking text, not merely long text: a slug, a sentence, a URL path, or a
    // lowercase placeholder is not a credential. The alphabet excludes `/` and `=`, so a
    // URL or a query string is split into short segments instead of matching whole; and
    // the run must carry an uppercase letter, a lowercase letter and a digit. A lowercase
    // hexadecimal secret is therefore NOT matched - a stated limitation of a structural
    // scan rather than something this check quietly pretends to cover.
    accept: (text) => /[A-Z]/.test(text) && /[a-z]/.test(text) && /[0-9]/.test(text),
  },
];

/** The tracked files, as git sees them. The index is the definition of "in the repository". */
function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split('\0').filter((path) => path.length > 0);
}

function isScannable(path) {
  if (EXCLUDED_PATHS.has(path)) return false;
  const absolute = resolve(REPO_ROOT, path);
  try {
    if (!statSync(absolute).isFile()) return false;
  } catch {
    // A tracked file that is absent from the working tree (a sparse checkout, or a file
    // deleted but not yet staged) is nothing to scan rather than a failure of the scan.
    return false;
  }
  return true;
}

function scanFile(path) {
  const text = readFileSync(resolve(REPO_ROOT, path), 'utf8');
  // A NUL byte means binary. Binary files carry no readable credential and matching
  // against them produces byte-offset noise rather than line numbers.
  if (text.includes('\0')) return [];

  const findings = [];
  const lines = text.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const pattern of PATTERNS) {
      pattern.regex.lastIndex = 0;
      for (let match = pattern.regex.exec(line); match !== null; match = pattern.regex.exec(line)) {
        if (pattern.accept && !pattern.accept(match[0])) continue;
        const credential = pattern.credential ? pattern.credential(match) : match[0];
        if (ALLOWED_CREDENTIALS.has(credential)) continue;
        findings.push({
          path,
          line: index + 1,
          pattern: pattern.name,
          match: match[0],
        });
      }
    }
  }

  return findings;
}

const files = trackedFiles();
const findings = files.filter(isScannable).flatMap(scanFile);

if (findings.length === 0) {
  console.log(`check-secrets: no findings in ${files.length} tracked files`);
  process.exit(0);
}

console.error(`check-secrets: ${findings.length} finding(s)\n`);
for (const finding of findings) {
  console.error(`  ${finding.path}:${finding.line}  ${finding.pattern}`);
  console.error(`    ${finding.match}`);
}
console.error(
  '\nRemove the value, or - if it is a documented placeholder - add it to ' +
    'ALLOWED_CREDENTIALS in scripts/check-secrets.mjs with the reason it is safe. ' +
    'A value that was ever real must be rotated, not just deleted.',
);
process.exit(1);
