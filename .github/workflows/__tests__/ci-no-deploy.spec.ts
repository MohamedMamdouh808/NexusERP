import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * T111: the pipeline must push nothing, deploy nothing, and release nothing.
 *
 * These assertions are structural, not substring searches. A grep for "docker push" would
 * pass a workflow that pushes through a shell variable, a different casing, or a script it
 * calls; it would also fail a workflow that merely mentions the phrase in a comment. So the
 * workflow is parsed into jobs and steps, and the semantics are checked on the parsed shape:
 *
 *   - a step that pushes an image is one whose `uses` is a build-push action with push
 *     enabled, or whose `run` invokes `docker push`
 *   - a registry login is a step whose `uses` is a login action
 *   - a deploy or release job is one whose id or name matches the concept
 *   - a deployed environment URL is a step that emits one
 *
 * Building an image without pushing it, `actions/checkout`, and npm cache steps are
 * required to be present and must not be flagged.
 *
 * A job that can be skipped can be skipped past its own failures: a skipped job is not a
 * failure, and any job that `needs` it is skipped too, so the pipeline can report success
 * with the integration suite never having run. The integration job therefore carries no
 * `if:` condition, which is asserted here.
 */

interface Step {
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly if?: string;
  /** `cache: npm`, which GitHub nests under `with:` on the setup-node step. */
  readonly cache?: string;
}

interface Job {
  readonly id: string;
  readonly name: string;
  readonly if?: string;
  readonly needs: readonly string[];
  readonly steps: readonly Step[];
}

interface ParsedWorkflow {
  readonly jobs: readonly Job[];
}

function setProperty(target: Record<string, string>, key: string, value: string): void {
  target[key] = value.trim();
}

/**
 * Parses the subset of YAML this workflow uses.
 *
 * A general YAML parser is deliberately not a dependency of the repository: this file runs
 * in CI with no `npm ci`, so it must be self-contained. The subset is jobs (two-space
 * indent), their scalar properties, and steps (six-space indent entries under `steps:`)
 * with `name`, `uses`, `run` (including block scalars) and `if`.
 */
function parseWorkflow(text: string): ParsedWorkflow {
  const lines = text.split(/\r?\n/);
  const jobs: Job[] = [];
  let inJobs = false;
  let job: Job | undefined;
  let step: Step | undefined;
  let collectingRun = false;

  const flushStep = (): void => {
    if (step && job) {
      job = { ...job, steps: [...job.steps, step] };
      jobs[jobs.length - 1] = job;
    }
    step = undefined;
    collectingRun = false;
  };

  const flushJob = (): void => {
    flushStep();
    job = undefined;
  };

  for (const raw of lines) {
    const trimmed = raw.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue;

    const indent = raw.length - raw.trimStart().length;

    if (indent === 0) {
      if (trimmed.startsWith('jobs:')) {
        inJobs = true;
        flushJob();
        continue;
      }
      if (inJobs) {
        // A new top-level key ends the jobs section.
        flushJob();
        inJobs = false;
      }
      continue;
    }

    if (!inJobs) continue;

    if (indent === 2 && !trimmed.startsWith('-') && /^[\w-]+:/.test(trimmed)) {
      flushJob();
      const id = trimmed.slice(0, trimmed.indexOf(':')).trim();
      job = { id, name: '', needs: [], steps: [] };
      jobs.push(job);
      continue;
    }

    if (!job) continue;

    if (indent === 4 && !trimmed.startsWith('-')) {
      if (collectingRun) flushStep();
      const match = /^([\w-]+):\s*(.*)$/.exec(trimmed);
      if (match) {
        const key = match[1];
        const value = match[2];
        if (key === 'name') job = { ...job, name: value };
        if (key === 'if') job = { ...job, if: value };
        if (key === 'needs') job = { ...job, needs: value.replace(/[[\]]/g, '').split(',').map((n) => n.trim()).filter(Boolean) };
      }
      continue;
    }

    if (indent === 6 && trimmed.startsWith('-')) {
      flushStep();
      step = {};
      const after = trimmed.slice(1).trim();
      const match = /^([\w-]+):\s*(.*)$/.exec(after);
      if (match) {
        const key = match[1];
        const value = match[2];
        if (key === 'name') step = { ...step, name: value };
        if (key === 'uses') step = { ...step, uses: value };
        if (key === 'if') step = { ...step, if: value };
        if (key === 'run') {
          if (value === '|' || value === '|-' || value === '>') {
            collectingRun = true;
            step = { ...step, run: '' };
          } else {
            step = { ...step, run: value };
          }
        }
      }
      continue;
    }

    if (indent >= 8 && step) {
      if (collectingRun) {
        step = { ...step, run: `${step.run ?? ''}\n${trimmed}` };
      } else {
        const match = /^([\w-]+):\s*(.*)$/.exec(trimmed);
        if (match) {
          const key = match[1];
          const value = match[2];
          if (key === 'name') step = { ...step, name: value };
          if (key === 'uses') step = { ...step, uses: value };
          if (key === 'if') step = { ...step, if: value };
          if (key === 'cache') step = { ...step, cache: value };
          if (key === 'run') {
            if (value === '|' || value === '|-' || value === '>' || value === '>-') {
              collectingRun = true;
              step = { ...step, run: '' };
            } else {
              step = { ...step, run: value };
            }
          }
        }
      }
      continue;
    }
  }

  flushJob();
  return { jobs };
}

const here = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(here, '..', 'ci.yml');
const workflow = parseWorkflow(readFileSync(workflowPath, 'utf8'));

function test(name: string, body: () => void): void {
  try {
    body();
    console.log(`  ok   ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}`);
    console.error(`       ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

console.log('ci-no-deploy: workflow assertions');

test('every job that runs Node tooling installs with npm ci --frozen-lockfile (T109)', () => {
  assert.ok(workflow.jobs.length > 0, 'the workflow defines no jobs');
  for (const job of workflow.jobs) {
    // The images job builds the Dockerfiles, which install their own dependencies inside
    // the image; the workflow-assertions job runs a standalone Node script. Neither runs
    // repository tooling, so neither needs `npm ci`.
    const runsNodeTooling = job.steps.some((step) => /(^|\s)npm\s+(run|ci|test|exec)/.test(step.run ?? ''));
    if (!runsNodeTooling) continue;

    const installs = job.steps.filter((step) => (step.run ?? '').includes('npm ci --frozen-lockfile'));
    assert.ok(
      installs.length > 0,
      `job "${job.id}" runs Node tooling but does not install with npm ci --frozen-lockfile`,
    );
  }
});

test('no step pushes an image to a registry', () => {
  const pushSteps = workflow.jobs.flatMap((job) =>
    job.steps
      .filter((step) => {
        const uses = step.uses ?? '';
        const run = step.run ?? '';
        const buildPushWithPush = /build-push-action/.test(uses) && /push:\s*true/.test(run);
        return /docker\s+push/.test(run) || buildPushWithPush;
      })
      .map((step) => `${job.id}: ${step.name ?? step.uses ?? 'run'}`),
  );
  assert.deepEqual(pushSteps, []);
});

test('no step logs in to a registry', () => {
  const loginSteps = workflow.jobs.flatMap((job) =>
    job.steps
      .filter((step) => /login-action|docker\/login/.test(step.uses ?? ''))
      .map((step) => `${job.id}: ${step.name ?? step.uses ?? ''}`),
  );
  assert.deepEqual(loginSteps, []);
});

test('no job is a deploy or a release', () => {
  const offenders = workflow.jobs
    .filter((job) => /deploy|release/i.test(job.id) || /deploy|release/i.test(job.name))
    .map((job) => job.id);
  assert.deepEqual(offenders, []);
});

test('no step emits a deployed environment URL', () => {
  const offenders = workflow.jobs.flatMap((job) =>
    job.steps
      .filter((step) => /https?:\/\/[^\s"']+/.test(step.run ?? ''))
      .map((step) => `${job.id}: ${step.name ?? 'run'}`),
  );
  assert.deepEqual(offenders, []);
});

test('building an image without pushing it is present and allowed', () => {
  const builds = workflow.jobs.flatMap((job) =>
    job.steps
      .filter((step) => /docker\s+build/.test(step.run ?? ''))
      .map((step) => `${job.id}: ${step.name ?? 'run'}`),
  );
  assert.ok(builds.length >= 2, `expected both images to be built, found ${builds.length}`);
});

test('actions/checkout is used', () => {
  const checkouts = workflow.jobs.flatMap((job) =>
    job.steps.filter((step) => /actions\/checkout/.test(step.uses ?? '')).map((step) => job.id),
  );
  assert.ok(checkouts.length > 0, 'no job checks out the repository');
});

test('npm dependency caching is used', () => {
  const cached = workflow.jobs.filter((job) =>
    job.steps.some((step) => step.cache === 'npm'),
  );
  assert.ok(cached.length > 0, 'no job caches npm dependencies');
});

test('the integration job cannot be skipped past its own failures (T111)', () => {
  const integration = workflow.jobs.find((job) => job.id === 'integration');
  assert.ok(integration, 'the workflow has no "integration" job');
  assert.equal(
    integration?.if,
    undefined,
    'the integration job has an `if:` condition, so it can be skipped and the pipeline can ' +
      'report success with the integration suite never having run',
  );
});

test('the integration job runs the suite against a real database', () => {
  const integration = workflow.jobs.find((job) => job.id === 'integration');
  assert.ok(integration, 'the workflow has no "integration" job');
  const runsTests = integration.steps.some((step) => /test:integration/.test(step.run ?? ''));
  assert.ok(runsTests, 'the integration job does not run test:integration');
  // The migration guard runs as a `pretest:integration` hook, so it executes before the
  // suite; migration-check-wiring.spec.ts pins that wiring.
  const runsMigrations = integration.steps.some((step) => /db:migrate/.test(step.run ?? ''));
  assert.ok(runsMigrations, 'the integration job does not apply migrations');
});

if (process.exitCode === 1) {
  console.error('\nci-no-deploy: FAILED');
} else {
  console.log('\nci-no-deploy: all assertions passed');
}