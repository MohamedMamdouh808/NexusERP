# Contract: Environment Variables

Every variable staging consumes, the **one** platform that sets it, what it controls, and
whether it is a secret. This is the contract behind FR-026 ("every environment variable staging
consumes MUST be listed with the platform that sets it and with what it controls") and FR-029
("the example environment file MUST list every variable the deployment needs, with safe
placeholders and an indication of which platform sets it").

The current `.env.example` documents `NODE_ENV`, `PORT`, `DATABASE_URL`, `LOG_LEVEL`,
`CORS_ORIGINS`, `SESSION_SECRET`, and `CSRF_SECRET`. This feature adds **`TRUST_PROXY`** and
annotates each variable with the platform that sets it. Nothing else in the contract changes,
and the schema's existing validation — including that the service refuses to start on a missing
or invalid required variable (FR-031) — is unchanged.

Legend for **Secret**: **yes** means the value must never be readable from the repository and
exists only in a platform's secret store; **no** means a safe value is committed in
`.env.example` and set as plain configuration on the platform.

---

## Service — set on Render

| Variable | Controls | Required? | Secret? | How the value is provided |
|---|---|---|---|---|
| `NODE_ENV` | Runtime mode. `production` on staging; the service's startup refuses to behave as anything else in this environment | defaulted to `development` | no | Blueprint, plain value |
| `PORT` | The TCP port the service listens on, bound on `0.0.0.0` | defaulted to `3000` **only when absent** | no | **Provided by the platform.** Deliberately not declared in the Blueprint, so the platform's value reaches the service unmodified (FR-034) |
| `DATABASE_URL` | The PostgreSQL connection string; must begin `postgresql://` | **yes** | **yes** | `sync: false` — entered once in the Render Dashboard. The staging value is the Supabase **session-mode pooler** address, used for both application traffic and migrations |
| `LOG_LEVEL` | Log verbosity (`trace`…`fatal`) | defaulted to `info` | no | Blueprint, plain value |
| `CORS_ORIGINS` | The explicit cross-origin allowlist; `*` is rejected by the schema and at least one origin is required | defaulted to the local dev origin | no | Blueprint, plain value — the frontend's own origin |
| `TRUST_PROXY` | How many forwarding-proxy hops the service trusts when deriving the client's address and protocol. `false` (default) trusts nothing; a positive integer trusts that many hops | defaulted to `false` | no | Blueprint, plain value. Off in every environment except staging (FR-007) |
| `SESSION_SECRET` | Signing material reserved for the authentication feature | `.min(16)`, optional | **yes** | `generateValue: true` — Render invents a randomized 256-bit value. Never transmitted to a human |
| `CSRF_SECRET` | Signing material reserved for the authentication feature | `.min(16)`, optional | **yes** | `generateValue: true` — as above |

`SESSION_SECRET` and `CSRF_SECRET` are not yet consumed by application logic — the
authentication feature will consume them — but they are **required to exist on staging** so
that the deployment is complete and so that a later feature does not have to add a secret to a
running environment. On staging they are therefore declared, generated, and stored; the local
`.env.example` carries safe placeholders only.

## Interface — set on Vercel

| Variable | Controls | Secret? | How the value is provided |
|---|---|---|---|
| *(none)* | — | — | The interface consumes **no runtime environment variable**. It calls the API through relative paths under `/api` (FR-005); the service's hostname lives in `vercel.json`'s rewrite target, not in the interface's configuration |

The frontend's build-time variable `VITE_API_PROXY_TARGET` is a **development and preview**
concern only: `vite.config.ts` uses it to point the dev and preview servers' `/api` proxy at a
running service. It is not set on Vercel and is not part of the staging contract; on Vercel the
`/api` rewrite replaces it.

## Database — set on Supabase

| Setting | Value | Notes |
|---|---|---|
| Project PostgreSQL version | major **17** | Verified against the running project (FR-002) |
| Data API (the provider's automatic REST surface) | **disabled** | FR-020; verified by `scripts/check-supabase-data-api.sh`, which asserts both the anonymous refusal and the project's own setting (FR-021) |
| Connection address used by the service | the **session-mode pooler** | Used for both application traffic and migrations. The transaction-mode pooler is not used, because it does not keep the session a schema change needs |

The database holds no application secret that the repository or the service needs: the service
reaches it only through `DATABASE_URL`, and disabling the Data API exposes nothing the service
uses, because the service's connection does not pass through it.

---

## Rules this contract makes checkable

1. **Completeness.** Every variable the service's validated environment schema reads appears in
   this table and in `.env.example` with a placeholder and the platform that sets it. A variable
   the schema reads but this table omits is a gap a reader cannot close from the repository.
2. **Single ownership.** Each variable has exactly one platform that sets it. A variable set in
   two places is a variable whose value depends on precedence, which nobody can reconstruct.
3. **Secrecy is a property of the variable, not of the environment.** A variable marked secret
   is secret in *every* environment; the value differs per environment, but the rule that its
   value never appears in the repository does not.
4. **No secret value in the repository.** Enforced by `scripts/check-secrets.mjs` (FR-030) and
   by the deploy-definition unit assertions (FR-028). `.env.example` carries placeholders, and
   the scan's allowlist exists precisely so the required placeholders are not mistaken for
   findings.
5. **Refusal on absence.** A missing or invalid required variable stops the service at startup
   with a message naming the variable, rather than letting it serve half-configured (FR-031).
   Only `DATABASE_URL` is required without a default; the rest are defaulted, which is safe
   because their defaults keep the service closed (nothing trusted, one local origin) rather
   than open.
