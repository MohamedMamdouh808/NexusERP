# Phase 0 — Research: Staging Deployment

Every decision below resolves something the specification's requirements depend on, states the
rationale, and names the alternative that was considered and rejected. Nothing in this
document is `NEEDS CLARIFICATION`.

Provider behaviour recorded here was read from the providers' own references (the Render
Blueprint YAML reference and schema, Vercel's project-configuration and `vercel.json`
documentation, and Supabase's Data API and Management API documentation) during planning. Where
a provider's response shape is asserted by a check, the check pins the observed shape rather
than a guessed field name; that is recorded in the decision that introduces the check.

---

## R-001 — The Render Blueprint: shape, placement, and the native Node runtime

**Decision.** A single `render.yaml` at the repository root declaring one **web service** with
**`runtime: node`**, built and started by the repository's own commands —
`buildCommand: npm ci && npm run build --workspace @nexuserp/shared && npm run build --workspace
@nexuserp/api` and `startCommand: npm run db:migrate && npm run start --workspace @nexuserp/api`
— with `plan: free`, `healthCheckPath: /api/v1/health`, and
`autoDeployTrigger: commit`. No image-build settings (a build path or a build context) are
declared, because there is no image and no second build. Every runtime variable the service
consumes is declared under `envVars` as a name plus exactly one of: a non-secret `value`,
`sync: false` (a secret whose value is entered once in the Render Dashboard), or
`generateValue: true` (a value Render generates).

**Rationale.** A Blueprint is Render's version-controlled, declarative form: it is the only
way FR-013 ("the staging deploy definition MUST live in the repository as version-controlled
configuration") can be satisfied for this host, and it is applied from the repository rather
than typed into a dashboard. `runtime: node` is used because the deploy is produced natively by
the repository's own build and start commands, the same commands the pipeline tests, so there is
no second build to drift from the verified one. Root placement is Render's default lookup for a
Blueprint, so no extra registration step stands between the repository and the deployed service.
`autoDeployTrigger: commit` is Render's setting for "deploy this service as soon as a commit
landed on the branch". It is what FR-010 requires after its correction: the deploy is **not**
gated by the mandatory checks, so the service must not wait for them. `sync: false` is Render's
"prompt for the value in the Dashboard" mode:
the value is never in the repository and is entered once by a human with account access, which
is exactly FR-027's requirement that a secret exist only in the platform's secret store.
`generateValue: true` produces a randomized, base64-encoded 256-bit value in the platform —
documented by Render as such — which is stronger than any hand-typed secret and keeps the
value out of every artefact, including this document.

**Alternatives rejected.**
- **A container-based runtime on Render.** Rejected: the project ships no build recipe for one —
  there is no image definition and no container runtime — so such a service would need a build
  input the repository no longer carries, and it would reintroduce the image concept the project
  deleted.
- **Registering a Blueprint from a non-root path.** Rejected: it adds a manual registration
  step for no benefit, and a definition that is not found by default is a definition that can
  silently stop being applied.
- **Declaring the secrets with placeholder `value:` entries.** Rejected outright: it would
  place a secret-shaped value in a version-controlled file, which FR-028 forbids and which
  the feature's own unit assertion is written to catch.
- **`autoDeployTrigger: checksPass`.** Rejected: it holds the service's deploy until the commit's
  checks report success, which gates the backend deploy on CI and contradicts FR-010's corrected
  text and the constitution's branch-workflow section. It would also make the two hosts behave
  differently — Render gated, Vercel not — while the runbook claimed neither was.

---

## R-002 — Migrations on deploy: one route, the start command

**Decision.** Exactly one migration route is configured. The Render Blueprint configures **no**
`preDeployCommand`; the start command
`npm run db:migrate && npm run start --workspace @nexuserp/api` applies migrations with
`prisma migrate deploy` before the service begins listening. The `&&` is what makes a failed
migration a failed start: the server never listens, the platform's health check is never
satisfied, and the deploy is discarded. The health check is answered only after the server
starts, which is after the migrations have finished.

**Rationale.** FR-015 requires a *single* mechanism and explicitly forbids configuring both.
The selected plan is Render's free instance, which does not provide a usable pre-deploy step,
so the start command — which runs the repository's own migration command and then the
repository's own start command — is the route. This is also the only route that holds for
*every* consumer of the repository's build rather than for one host, and the `&&` gives it the
fail-fast property: a migration that cannot apply exits non-zero, so the start never reaches
the server and nothing listens. The health check remains the platform's judgement of whether a
new version may take traffic, which is FR-018.

**Alternatives rejected.**
- **`preDeployCommand` on Render.** Rejected for this plan: the free plan does not provide it,
  and configuring it anyway would leave FR-015 satisfied only on paper. If the plan is later
  upgraded, the pre-deploy command would be added and the start command's migration step
  removed, so exactly one route is ever configured.
- **A separate migration job or a second migration tool.** Rejected: it introduces a second
  path to the same schema, which is precisely the divergence FR-015 forbids and the failure
  mode where one environment's schema is ahead of another's.
- **Running migrations from `main.ts` at application start.** Rejected: it would put schema
  management inside the application process, making a migration failure an application crash
  that the platform reads as an unhealthy service rather than as a failed deploy, and it would
  run before the validated configuration and logger exist.

---

## R-003 — Vercel: Root Directory, and why the configuration lives inside it

**Decision.** The Vercel project's **Root Directory** is set to the frontend workspace, and the
repository's Vercel configuration file is `frontend/vercel.json` — inside that Root Directory —
rather than at the repository root. The project setting "Include source files outside of the
Root Directory in the Build Step" is **enabled**, because the frontend's build depends on the
`shared` workspace, which sits outside the Root Directory.

**Rationale.** Vercel's own documentation is unambiguous that a configuration file is honoured
**only** when it sits in the project's Root Directory: a `vercel.json` at the repository root
is ignored once the Root Directory is set elsewhere. That makes the file's location a
consequence of the Root Directory setting rather than a preference, and it is why the plan
places the file where it is. The Root Directory is set to the frontend workspace because the
deployed artefact is the interface build alone; leaving the Root Directory at the repository
root would make Vercel try to treat the repository as a single application. Enabling the
outside-Root-Directory setting is what makes the frontend's dependency on `shared` resolvable
at build time; without it, the build sees only the frontend directory and cannot resolve
`@nexuserp/shared`.

**Alternatives rejected.**
- **`vercel.json` at the repository root with no Root Directory set.** Rejected: it cannot be
  combined with a Root Directory, and without one Vercel builds the wrong project. Choosing
  between them, the Root Directory is the setting that determines *what* is built, so it wins
  and the config file moves to match it.
- **Vendoring the shared package into the frontend workspace.** Rejected: it duplicates
  contract definitions, which is the one thing the `shared` workspace exists to prevent, and
  it would let the deployed contract drift from the service's.
- **Publishing `shared` to a registry and installing it as a real dependency.** Rejected: it
  adds a registry, a publish step, and a version-bump ceremony for a private monorepo that
  already resolves the dependency locally, and it would make the pipeline a publisher.

---

## R-004 — Vercel install and build commands for a workspace repository

**Decision.** Inside `frontend/vercel.json`:

- `installCommand`: change to the repository root and install from the committed lockfile —
  `cd .. && npm ci --frozen-lockfile`
- `buildCommand`: build the `shared` workspace **first**, then the frontend workspace —
  `cd .. && npm run build --workspace @nexuserp/shared && npm run build --workspace @nexuserp/web`
- `outputDirectory`: `dist` (relative to the Root Directory, which is the frontend workspace)
- `framework`: `vite`

**Rationale.** The repository has a single lockfile at its root, and npm workspaces hoist
dependencies there; `npm ci` cannot run from `frontend/` because there is no lockfile in that
directory. Changing to the root for the install is therefore not a convenience but the only
correct invocation. The build must compile `shared` before `web` because the frontend's build
(`tsc -b && vite build`) resolves `@nexuserp/shared` through the built `shared/dist`; building
the frontend alone would either fail to resolve or, worse, bundle a stale build. This ordering
already exists at the repository root (`npm run typecheck` and `npm run build` both compile
`shared` first), so the deploy command restates an existing, tested order rather than
inventing one. `outputDirectory: dist` is correct because Vercel resolves it relative to the
Root Directory: the frontend's own build writes to `frontend/dist`, which is exactly
`<Root Directory>/dist`. Declaring `framework: vite` removes any chance of a framework
mis-detection on a repository whose root is not the application.

**Alternatives rejected.**
- **`npm ci` run from `frontend/`.** Rejected: it fails, because the lockfile is at the root.
- **Building the frontend without building `shared` first.** Rejected: the frontend imports the
  shared package's compiled output, so a missing or stale `shared/dist` produces either a
  build failure or a bundle that does not match the contract the service serves.
- **`npm install` instead of `npm ci`.** Rejected: `npm ci` installs exactly the committed tree
  and fails when the lockfile and the manifests disagree, which is what makes the deployed
  frontend the same dependency set the pipeline tested (the foundation's FR-049 rule).
- **Leaving the commands unset and relying on Vercel's defaults.** Rejected: the defaults are
  derived from the Root Directory as a standalone application, which is not this repository's
  shape.

---

## R-005 — Rewrite order, and the API prefix that must not be swallowed

**Decision.** The rewrite list is ordered so the **API forwarding rule is evaluated first** and
the **single-page fallback second**, and the API rule matches the `/api` path segment
precisely (Vercel's `"/api/:path*"`) rather than a string prefix. The fallback matches
everything that did not match the API rule, so a single-page route whose text merely begins
with the letters `api` still reaches the interface.

**Rationale.** Rewrites are evaluated in order and the first match wins, so the order is the
precedence FR-006 and the specification's edge case require: an API request must reach the
service, and a single-page route must reach the interface. Matching the `/api` **segment**
(rather than a glob such as `api*`) is what keeps the two from colliding: a route like
`/apiary` or `/api-docs` is a different first path segment and is therefore served by the
fallback, while `/api/v1/health` matches the forwarding rule and reaches the service. Getting
this wrong is silent: the page still loads, and only the API call fails, which is exactly the
failure the specification's edge case names.

**Alternatives rejected.**
- **A `routes` entry with a custom configuration.** Rejected: `rewrites` expresses the
  requirement directly, and `routes` additionally disables Vercel's own defaults, which would
  have to be re-created by hand.
- **Proxying through a Vercel serverless function.** Rejected: it adds a runtime component and
  a second place that can be wrong, for a requirement a rewrite satisfies with no code
  (and it would be the first microservice-shaped thing in a v1 that forbids them).
- **A custom subdomain pointed at the service.** Rejected by the specification's
  clarification: a custom domain is out of scope, and the requirement is that the browser sees
  exactly one origin, which the rewrite provides over the frontend's own domain.
- **A string-prefix API rule (`/api*`).** Rejected: it collides with single-page routes that
  begin with the same letters, which is the edge case the specification calls out.

---

## R-006 — Proxy trust as configuration, off everywhere except staging

**Decision.** `TRUST_PROXY` is added to the validated environment schema with a default of
`false`. Accepted values are `false` (trust no proxy — the default) and a positive integer
naming the number of proxy hops in front of the service. `main.ts` reads the parsed value
from the loaded configuration instead of the hardcoded `false` it currently passes, and calls
the platform's proxy-trust setting with it. Staging sets it to the hop count that is actually
in front of the service; every other environment leaves it unset and therefore trusts
nothing.

**Rationale.** FR-007 requires two things that a constant cannot satisfy: the service must
derive the client's address and protocol from the forwarding proxy's headers **in staging**,
and must **not** trust those headers outside staging, and the setting must be configuration
rather than a compiled constant. A hop count is the precise form of "trust the proxy": it
tells the platform how many trailing entries of the forwarded-for chain to skip, so the
address the service records is the one the nearest trusted proxy supplied. A blanket `true`
would instead accept the leftmost, client-supplied entry and let a caller dictate the address
the product records — the edge case the specification names, and the input rate limiting and
audit will later depend on. Keeping the default `false` means a misconfigured or
newly-provisioned environment fails closed: it records the caller's socket address rather than
a spoofable header.

**Alternatives rejected.**
- **Gate the setting on `NODE_ENV === 'production'`.** Rejected: staging runs with
  `NODE_ENV=production` — the deploy definition sets it, deliberately — so this would turn
  trust *on* in exactly the environment the specification says must not have it, and off in the
  one that must.
- **Pass `true` unconditionally.** Rejected: it trusts whatever the caller sends, which is the
  spoofing path the current `false` exists to close.
- **Trust a fixed list of proxy addresses compiled into the service.** Rejected: it makes the
  setting a compiled-in constant (contradicting the requirement that proxy trust be
  configuration) and breaks the moment the platform's egress addresses change.
- **Leave the constant at `false` and document that rate limiting must not use the address.**
  Rejected: it defers the requirement instead of meeting it, and it leaves the service
  recording the proxy's address as the client's, which is wrong for logs and audit too.

---

## R-007 — Port binding: the platform's port, on all interfaces

**Decision.** No change. The service continues to listen on `configuration.port` — parsed from
the platform-provided `PORT` environment variable, defaulting to `3000` only when `PORT` is
absent — bound to `0.0.0.0`, which is what it already does
([main.ts:86](file:///d:/web-projects/NexusERP/backend/src/main.ts#L86)). The Blueprint does
**not** declare `PORT`, so the platform's value reaches the service unmodified.

**Rationale.** FR-034 asks the service to bind `0.0.0.0` on the port the platform provides, not
on a port fixed in the repository. The service already satisfies this: it reads `PORT` from the
validated environment, and it binds all interfaces, which is what makes it reachable from
outside. Declaring `PORT` in the Blueprint would *override* the platform's value
with a fixed one and is therefore a defect rather than a courtesy. Binding `127.0.0.1` would
make the service unreachable from the platform's router. The property is asserted by test
rather than assumed.

**Alternatives rejected.**
- **Declaring `PORT` in the Blueprint with a fixed value.** Rejected: it defeats the
  requirement, and it would make the service unreachable when the platform assigns a different
  port.
- **Binding `127.0.0.1`.** Rejected: nothing outside the host's router could reach it, so the
  platform's health check and the frontend's rewrite would both fail.
- **Fixing `PORT` in the service's configuration.** Rejected: a default is not an override, and
  a value pinned in the repository would ignore the port the platform provides, which is
  exactly what FR-034 forbids.

---

## R-008 — Keeping the declared health path and the served route in agreement

**Decision.** The Blueprint declares `/api/v1/health`, and a unit specification asserts that
this string is the route the service actually serves, by deriving the route from the source
rather than restating it: the global prefix the bootstrap sets (`api/v1`) composed with the
health controller's declared path (`health`). The assertion compares the composed route to the
Blueprint's `healthCheckPath`, so the two cannot drift.

**Rationale.** FR-023 requires the service to declare its health address to the platform at
`/api/v1/health` and the platform to use it to decide whether a deploy is healthy. A health
path that disagrees with the route the service serves is the worst kind of defect here: the
platform polls a path that never answers, the deploy is judged unhealthy, and the previous
version keeps serving — so the environment *looks* broken for a reason nobody can see, and the
deploy that should have shipped never does. Deriving the route from code rather than asserting
a second hardcoded literal is what makes the check meaningful: it fails if a future change
moves the prefix or the controller, which is precisely when the Blueprint would need updating.
The composed route already exists in three places that must agree — the bootstrap's
`setGlobalPrefix('api/v1')`, the health controller's `@Controller('health')`, and the OpenAPI
document generated under the same prefix — so the check adds the fourth place, the deploy
definition, to the set that is verified.

**Alternatives rejected.**
- **Asserting the literal string `/api/v1/health` in both the Blueprint and the test.**
  Rejected: it proves only that two copies of the same string match, and it would keep passing
  after the prefix moved and the Blueprint became wrong.
- **Reading the route from the generated OpenAPI document.** Rejected as the primary source:
  it is a generated artefact, and the check would then depend on generation having run. The
  integration suite already proves the live route answers `200` at `/api/v1/health`
  (`health.spec.ts`), so the unit check's job is specifically to tie the *deployment's*
  declaration to the same truth.
- **Relying on the platform default health path.** Rejected: the platform's default would probe
  a path this service does not serve, so the deploy would never be judged healthy.

---

## R-009 — The deploy-definition tests: self-contained parsers, no YAML dependency

**Decision.** The two unit specifications that read `render.yaml` and `vercel.json` are
self-contained: they parse the subset of each file they assert on with a small, explicit
parser, in the pattern the repository already uses in
[ci-no-deploy.spec.ts](file:///d:/web-projects/NexusERP/.github/workflows/__tests__/ci-no-deploy.spec.ts).
No YAML parser is added as a dependency, and the assertions are structural — they inspect the
parsed shape, not substrings.

**Rationale.** The repository deliberately carries no YAML dependency, and adding one to assert
on a file whose schema a provider validates anyway would be a dependency bought for a test.
The precedent is established and load-bearing: `ci-no-deploy.spec.ts` documents why it
hand-parses, and the same reasoning applies here — a substring search for `autoDeployTrigger` would
pass on a commented-out line, and a search for `healthCheckPath` would pass on a value nested
under the wrong service. The JSON specification needs no parser at all. Structural assertions
are also what make the secret assertion honest: the test inspects the *values* attached to
variable entries and the modes (`sync`, `generateValue`) they use, rather than searching the
file's text for something that looks like a password.

**Alternatives rejected.**
- **Adding a YAML parser dependency.** Rejected: a test-only dependency for a file shape a
  provider already validates, in a repository whose convention is self-contained checks.
- **Substring assertions.** Rejected: they pass on comments, on the wrong nesting, and on
  documentation that merely mentions the setting.
- **Validating against Render's published JSON Schema at test time.** Rejected as the primary
  check: it validates the *provider's* schema, not this feature's requirements — a Blueprint
  can be valid and still declare the wrong health path or the wrong trigger. The provider's
  validator (`render blueprints validate`) is documented in the runbook as a complementary
  step, not as the assertion.

---

## R-010 — The Node-version pin: recorded, not silently changed

**Decision.** The pipeline's `node-version: "22"` pin is **left as it is** by this feature and
recorded here as a known inconsistency with `.nvmrc` (`24`) and the root `engines.node`
(`>=22.13.0`). The runbook names it. Changing it is a separate, deliberate decision.

**Rationale.** Nothing in this feature requires a different Node version: the parsers, the
configuration change, and the integration tests run on 22 and 24 alike, and Render's native
runtime reads the Node version from the repository's `.nvmrc` / `engines` field rather than from
the CI pin. Silently changing a runtime pin inside
a deployment feature would make the feature's diff contain a change no requirement asked for
and no success criterion covers, which is exactly the scope creep the constitution's Principle
IX refuses. Recording it keeps it visible; it belongs in a change that is about the runtime,
with its own verification.

**Alternatives rejected.**
- **Bumping the pin to 24 in this feature.** Rejected: unrelated to every requirement here,
  and it would make the feature responsible for a runtime change it does not test.
- **Silently ignoring it.** Rejected: the inconsistency is real — a developer on 24 and a
  pipeline on 22 can disagree about a native dependency's behaviour — and an unrecorded
  inconsistency is one nobody resolves.

---

## R-011 — Secret handling, and asserting that no secret value is present

**Decision.** Each secret-bearing variable is declared in the Blueprint with exactly one
non-`value` mode: `sync: false` for a value a human supplies once (the database connection
string, which embeds a credential), and `generateValue: true` for a value the platform should
invent (`SESSION_SECRET`, `CSRF_SECRET`, which are never transmitted anywhere and need only be
long and random). The unit specification asserts three properties structurally: every
variable entry carries a name; a secret-bearing name uses `sync: false` or
`generateValue: true` and carries **no** `value`; and no value anywhere in either definition
matches a secret-shaped pattern (a connection string carrying a password, a long base64 or
hex blob, or a provider-prefixed key). A separate `TRUST_PROXY` test asserts the new variable's
default and accepted values.

**Rationale.** FR-028 and FR-027 require the deploy definitions to contain variable names and
non-secret settings only. Making the *mode* the assertion — rather than searching for a
password — is what makes the check structural: it fails the moment someone adds a `value:` to
a secret entry, whatever that value happens to look like. Choosing `generateValue` for the two
application secrets rather than `sync: false` is deliberate: a
platform-generated 256-bit value is stronger than anything a person types, it is never
transmitted to a human, and it cannot therefore end up in a document — which is FR-027's
requirement that no secret value appear in a document. The connection string is `sync: false`
because it cannot be generated: the platform cannot know the provider's address, user, or
password.

**Alternatives rejected.**
- **`sync: false` for every secret.** Rejected: it asks a human to invent two cryptographic
  secrets and carry them, which is strictly worse than letting the platform generate them and
  is how a weak value ends up in a runbook.
- **Committing non-secret values for the two application secrets.** Rejected: a committed
  secret is compromised the moment it is committed, and the file's whole point is that it can
  be read by anyone.
- **Asserting only with a regex over the file's raw text.** Rejected as the whole check: it
  cannot tell a variable *name* from a variable *value*, so it would fail on the literal name
  `DATABASE_URL` in one file layout and pass on a real value in another.

---

## R-012 — The secret scan: runnable, self-contained, and part of the mandatory checks

**Decision.** A standalone scan, `scripts/check-secrets.mjs`, walks the repository's tracked
files and reports any secret-shaped finding, exiting non-zero when it finds one. It is runnable
locally with no arguments and is added to the pipeline as a mandatory check. Its pattern set is
explicit and documented in the file: provider-prefixed keys, private-key blocks, connection
strings carrying a password, and long high-entropy tokens — with an allowlist for the
documented placeholders in `.env.example`.

**Rationale.** FR-030 requires a secret scan that is runnable against the repository, reports
no finding, and runs as part of the mandatory checks. A self-contained scan keeps the promise
the rest of the repository makes — a check that runs from the repository with no `npm ci` — and
means the check exists the moment the file does, rather than depending on a tool being present
in the runner. The allowlist matters for honesty in the other direction: `.env.example` is
*required* to carry placeholder values (FR-029), so a scan that flags them would be a scan
someone disables, and a disabled scan reports nothing for the wrong reason.

**Alternatives rejected.**
- **Gitleaks (or an equivalent scanner) in the pipeline.** Rejected for this feature: it adds a
  tool the repository must install and pin, for a repository of this size whose secret surface
  is two files, and it moves the check out of the "runs from the repository" convention. The
  decision is revisit-able: if the repository's secret surface grows, the self-contained scan's
  pattern set is the natural thing to replace with a maintained one, and the pipeline step that
  invokes it does not change.
- **Relying on provider-side secret scanning only.** Rejected: the providers scan what they
  receive, not what the repository contains, and FR-030 asks for a check against the repository.
- **A scan that reads only the two deploy definitions.** Rejected: FR-030 asks for a scan of the
  repository, and a scan that covers two files cannot report on the repository's history of
  mistakes — nor is it the check the runbook can point a reader at.

---

## R-013 — The data-surface check: the refusal *and* the setting

**Decision.** `scripts/check-supabase-data-api.sh` — documented in the runbook, runnable by a
reader, requiring only the project's reference and an anonymous request — performs **two**
assertions and fails unless both hold:

1. **The refusal.** An anonymous request to the project's own REST surface naming a known table
   is refused, and the response discloses no rows. The check asserts the refusal and the
   absence of a data array, and it records the observed status so the assertion is pinned to a
   response the provider actually returns rather than to a guessed code.
2. **The setting.** The same check reads the project's own Data API configuration through the
   provider's Management API and asserts the data surface is **disabled**, so the result cannot
   come from a mistyped address, a missing project, or an unrelated error.

**Rationale.** FR-021 requires a check that proves the surface is *off* rather than merely
unanswered, and the specification's edge case spells out why: a mistyped address, a missing
project, and an unrelated error all produce an error with no rows, so an observation alone can
pass for the wrong reason. Reading the project's own setting is what makes the check
non-vacuous, and it is why the requirement insists on both halves. Keeping the check as a
documented, runnable script serves FR-042 ("every check this feature adds MUST be runnable
without deploying anything") and FR-021's "a reader can reproduce the no-data result on their
own": it needs no CI credentials, no deployment, and no tooling beyond a shell and the
provider's own address. It cannot be a mandatory CI check, because it asserts against a live
project that CI does not and must not own — so it is documented and runnable rather than
gated, which the specification's wording ("a documented, runnable command") reflects.

**Alternatives rejected.**
- **Asserting only the anonymous refusal.** Rejected: it is the vacuous version the
  specification explicitly rules out.
- **Asserting only the project setting.** Rejected: it proves the configuration but not the
  effect, and a project whose setting says "disabled" while its endpoint still answers is the
  failure that matters.
- **Making it a mandatory pipeline check.** Rejected: it would require the pipeline to hold
  staging credentials, which the foundation's rule that the pipeline never touches a hosted
  environment forbids, and it is out of scope for every environment except staging.
- **Asserting a specific HTTP status code without recording it.** Rejected: the provider's
  refusal code is the provider's to choose, and pinning a guess makes the check fail for a
  reason that is not a security finding.

---

## R-014 — The native runtime: the build and start commands are the repository's own

**Decision.** There is no image runtime test. The deployed artefact is produced by the
repository's own `build` and `start` commands — `npm run build --workspace @nexuserp/shared &&
npm run build --workspace @nexuserp/api` and `npm run start --workspace @nexuserp/api` — which
the existing `build` job and the existing `integration` project already exercise. The feature
therefore adds no container-based specification: there is nothing new to assert about where the
artefact comes from, because the platform runs the same commands the pipeline already runs.

**Rationale.** With no container build in the project there is no image and no container-specific
runtime posture to verify. FR-034 (bind `0.0.0.0` on the platform's port) is a property of the
service's own configuration, and the service already satisfies it; FR-032 (local development
with no container runtime) is verified by running the documented commands. Putting the
assertion in the existing `build` and `integration` jobs is what keeps it inside an existing
mandatory check rather than inventing a new one, and it means the deployed artefact is exactly
the tree the pipeline tested.

**Alternatives rejected.**
- **An image runtime test.** Rejected: there is no image — the project no longer builds one — so
  a test that builds one would test an artefact this repository no longer produces.
- **Asserting the runtime posture from an image recipe's text.** Rejected: there is no such
  recipe, and a text assertion would prove the recipe rather than the behaviour anyway.
- **Adding a new dedicated CI job.** Rejected: the `build` and `integration` jobs already
  exercise the repository's own commands in existing mandatory checks, so a new job would
  duplicate the build and the cost.

---

## R-015 — The deploy trigger: the hosts deploy on push, and no gate stands in front of them

**Decision.** No workflow step deploys, pushes, restarts, or releases anything — that refusal is
unchanged, and FR-011 still holds. The trigger is each host's own Git integration deploying on a
push to `main`, and nothing else. There is no branch protection on `main` and no required status
check: the project works on a single branch with direct pushes (see the constitution's "Branch
Workflow and What It Means for Deployment"). The Blueprint therefore declares
`autoDeployTrigger: commit`, so Render deploys as soon as the commit lands rather than waiting for
the checks.

**Rationale.** FR-010, as corrected, requires the opposite of a gate: a deploy MUST NOT be gated
by the mandatory checks, and the documents MUST say so plainly. The earlier version of this
decision — branch protection declaring every check a required status check, with
`autoDeployTrigger: checksPass` as Render's half of "wait for the checks" — depended on a
pull-request workflow this project does not use, so it described a mechanism that could never be
configured and a claim that could never be true. The structural reason for the pipeline's
deploy-freedom is unchanged: a pipeline that deploys would be a second, unguarded path to the
environment and would have to hold credentials for it, so verification stays its terminal action
(FR-011, FR-050a). What is recorded instead is the cost, stated rather than hidden: a commit whose
checks are failing, still running, or never run reaches staging, so the checks are read after the
push rather than before it. SC-016 now asks for that statement to exist in the runbook and the
README, verified by review, instead of for a forbidden merge to be demonstrated.

**Alternatives rejected.**
- **A deploy job in the pipeline.** Rejected: it contradicts FR-011 and the foundation's
  FR-050a, and it would need credentials, making the pipeline a credential holder for a hosted
  environment it must never touch.
- **`autoDeployTrigger: checksPass` with branch protection.** Rejected: it would gate the backend
  deploy on CI while the frontend host progressed regardless, it contradicts FR-010's corrected
  text and the constitution's branch-workflow section, and with no pull requests the
  required-status-check list it depends on could never be enforced.
- **Documenting a gate that is not configured.** Rejected: that is the defect this amendment
  corrects. A documented gate that does not exist is worse than no gate, because it transfers
  trust to a mechanism nobody runs.
- **Manual deploys.** Rejected by FR-014: a deploy that needs a human is one that is skipped.

---

## R-016 — The runbook's home, and what it must refuse to claim

**Decision.** The deployment runbook is `docs/staging-deployment.md`, beside `docs/PRD.md`. It
carries, as required sections: creating the three projects; every variable with the platform
that sets it; the first deploy; verification; rollback; the statement that the deploy is not gated
by CI checks, carrying the observation rather than the assertion; the plan-and-cost table with
upgrades marked **not purchased**; and the
backup statement. It states as observed behaviour the entry-plan effects a reviewer will see —
a database project that pauses when idle, a service instance that stops when idle, a cold start
on the next request, and any plan-level limit on deploy history; the free plan has no pre-deploy
step, which is why migrations run in the start command. It
records the retention gap as an **open product-requirements decision**. It enumerates what is
out of scope.

**Rationale.** FR-037 to FR-041 require the runbook, the cost table, the honest backup
statement, the out-of-scope list, and the rollback procedure; the plan treats each as a
contract item rather than hoping the prose covers it. Placing it in `docs/` is what makes it
survive this feature's directory becoming archival, which matters because its purpose is to let
someone *rebuild* staging later. Stating the entry-plan behaviour is the honest-boundary
requirement in practice: personas read a silent runbook as a guarantee, so a pause or a cold
start that the document does not name reads as an outage the document promised would not
happen. The retention gap is recorded rather than resolved because the product requirements'
eventual retention target is a product decision, not a deployment one, and resolving it here
would silently narrow a requirement this feature has no authority over (FR-039).

**Alternatives rejected.**
- **Putting the runbook inside the feature's specification directory.** Rejected: that
  directory is the record of *how this feature was planned*; the runbook is the artefact an
  operator follows, and it must remain findable after the feature is archival.
- **Splitting the runbook, the cost table, and the backup statement into separate files.**
  Rejected: FR-037 names one document, and the honest limits are most likely to be read when
  they sit beside the procedure they qualify.
- **Leaving the backup section to the providers' documentation.** Rejected by FR-039: the
  requirement is that *this* documentation claims only what the providers give and says
  explicitly what they do not, and a reader must not have to derive that.
- **Resolving the retention gap here.** Rejected: it is a product-requirements decision
  (FR-039), and this feature has neither the authority nor the information to make it.
