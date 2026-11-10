# Phase 1 Data Model: RBAC and Audit Log

Grounded in `database/prisma/schema.prisma` (current state read 2026-11-09). All new/changed tables get RLS enabled with **no policies** in a new migration (FR-023); org-owned children use composite foreign keys over `(organization_id, id)`. The migration is new-file-only — never an edit of an applied migration (FR-024; guard exists, R-013).

## 1. `roles` / Role — CHANGED

Current: `id`, `key VARCHAR @unique` (global!), `name`, `description`, `isSystem`, `organizationId String?` (nullable), timestamps.

Changes:

| Field | Change | Why |
|---|---|---|
| `organizationId` | nullable → **NOT NULL**, indexed | FR-001: roles are org-owned; nothing else owns a role |
| `key` | global `@unique` → `@@unique([organizationId, key])` | template keys repeat per organization |
| `name` | (stays, VARCHAR) | uniqueness enforced case-insensitively per org at the application level (FR-014): creation/rename refusal 409 on `lower(name)` collision of the same org; a per-org functional unique index `(lower(name), organization_id)` is acceptable if Prisma review prefers it in raw SQL — decide at task time |
| `isSystem` | (stays, Boolean) | marks the five template copies; read-only rule keyed on this (FR-013) |

Backfill (in the new migration, before any child-table change): delete the 5 stale NULL-org `roles` rows in the dev database (empty `role_permissions`, no membership links after R-003's column removal); then upsert five template roles per organization with their permission links (`ON CONFLICT (organization_id, key) DO NOTHING` semantic via Prisma `upsert`). Idempotent (SC-008).

State invariants: `Administrator` per org holds the entire permission catalogue always (FR-032; maintained by the provisioning sync routine, exercised by SC-016). Cannot rename/set-permissions/delete while `isSystem` (403 — module refuses in service; DB has no constraint). Per-org name uniqueness uses a 409 on collision (FR-014), and unknown permission codes in payloads → 400, both application-validated in the same transaction.

## 2. `membership_roles` / MembershipRole — NEW

| Field | Type | Constraint |
|---|---|---|
| `membership_id` | UUID | composite PK part; composite FK `(organization_id, membership_id)` → memberships |
| `role_id` | UUID | composite PK part; composite FK `(organization_id, role_id)` → roles |
| `organization_id` | UUID | NOT NULL, indexed; composite FK `(organization_id, id)` → organizations |

RLS on, no policies. Multi-role per membership; ≥1 role enforced application-side inside the same transaction as membership changes (FR-005: empty list → 400 naming the field; assigned-role delete refusal ensures ≥1 survives custom-role deletion).

Migration backfill: for each membership with `role_key='administrator'` link the org's role with key `administrator` (created by the backfill above; NULL-org roles already removed). Then drop `memberships.role_key` (a separate ordered step in the same or a subsequent migrations so `migrate` never needs interactive resolution — order: (a) create `membership_roles` + backfill; (b) drop `role_key`).

## 3. `audit_logs` / AuditLog — NEW

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | default uuid4 (Prisma `@default(uuid())`) |
| `organization_id` | UUID **nullable** | NOT NULL for every org-scoped event; NULL only for anonymous auth events (unknown-email login failure). Org-scoped listing predicates `organization_id = active` can never match NULL rows (SC-013 proven by test) |
| `user_id` | UUID **nullable** | FK → users; NULL for anonymous events. Indexed for the user filter |
| `action` | VARCHAR NOT NULL | one shared constants module of codes (R-016 open item) |
| `record_type` | VARCHAR NOT NULL | e.g. `membership`, `role`, `user` |
| `record_id` | UUID nullable | subject record's id |
| `before` | JSONB nullable | prior value (redacted of secrets; before/after permission sets for role changes) |
| `after` | JSONB nullable | new value |
| `client_address` | VARCHAR nullable | proxy-trusted client address; present only on login-failure entries (FR-030: timestamp + address + reason code) |
| `reason_code` | VARCHAR nullable | login-failure reason code |
| `unknown_account_hash` | VARCHAR(32) nullable | keyed HMAC-SHA256, truncated 32 hex — only on unknown-account login failures |
| `unknown_account_marker` | VARCHAR(64) nullable | sanitized, control-char-free, length-capped marker — only on unknown-account login failures |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | timestamp of the action; append-only makes it immutable |

Indexes: `(organization_id, created_at DESC)` org listing scan; `(organization_id, user_id)`; `(user_id)`.

Enforcement:
- **Append-only** (FR-017): same migration executes `REVOKE UPDATE, DELETE, TRUNCATE ON audit_logs FROM <app role>;` — the app role is the one `DATABASE_URL` connects as (derived from the URL; the migration must not hardcode an env-specific role name — it uses a `DO $$ ... EXECUTE` block resolving the CONNECT privileges or, simpler, the documented role name used by all environments; decide role-name resolution at task time and keep it consistent with `check-rls.ts` assumptions). SC-005 attempts all three from the app role and expects failure.
- No endpoint offers update/delete; no service method mutates rows.

Validation rules (application): audit writes contain no password, hash, token, or session identifier values; `before`/`after` are built by the caller from non-secret projections (FR-019; redaction guard covers log output).

## 4. `users` / User — CHANGED

| Field | Change | Notes |
|---|---|---|
| `must_change_password` | NEW Boolean NOT NULL DEFAULT false | FR-006/FR-027/FR-028; set true at member creation with initial password; cleared by successful change-password; exposed by `GET /auth/me`; NOT exposed on register/login responses (register creates yourself, flag false) |

Registration path stays flag=false (the creator just set the real password).

## 5. `memberships` / Membership — CHANGED

| Field | Change | Notes |
|---|---|---|
| `role_key` | DROPPED after `membership_roles` backfill | R-003; single-role semantics superseded. Existing rows all hold `'administrator'` per the register path |
| `isActive` | (stays) | deactivation/reactivation state machine: reactivate only from deactivated (409 `INVALID_STATE_TRANSITION` on active→active, likewise deactivate on deactivated — FR-010) |

State transitions:

```
          deactivate                 reactivate
active ────────────→ inactive ───────────→ active
   │                                                │
   └────────── 409 LAST_ADMINISTRATOR if the              │
              membership holds the Administrator
              system role and no other active
              membership of the org does ─────────────────┘
```

Cross-org record addressing (`/memberships/:id`, `/roles/:id`) resolves WITH the org predicate and 404s when absent — never 403 (FR-022).

## 6. `permissions` / Permission — UNCHANGED

Reference data (25 rows seeded). Codes `resource.action`. `roles.manage` holders may reference any code in payloads; nonexistent codes → 400. Catalogue growth is platform work: new permission + sync Administrator roles (FR-032) + seed idempotent (R-007).

## 7. Unchanged but interacting

| Table | Interaction |
|---|---|
| `sessions` | deleted by deactivate (org-scope, R-012) and by other-session invalidation on successful password change (all orgs, R-009); rotated (delete+create) for the current session |
| `login_attempts` | counters stay as-is; the limiter keys change-password failures by user id into the same 15-min window (R-009); raw email stays here (out of audit scope) |
| `organizations`, `warehouses`, `document_sequences` | untouched |
| `role_templates`, `role_template_permissions` | reference recipe, untouched |

## Entity relationship (post-feature)

```
organizations ──< roles ──< role_permissions >── permissions
      │              │
      │              └────< membership_roles >──── memberships ──< sessions
      │                                                │
      └──(nullable for anonymous auth events)──────────┴──< audit_logs
                                                       users ── must_change_password
```

`audit_logs.organization_id` → organizations (nullable); `audit_logs.user_id` → users (nullable). `membership_roles` joins only within one organization by construction (composite FKs).

## Decimal rule check

No money or quantity columns introduced — schema checker (`check:schema-numeric-types`) unaffected. Counters stay INTEGER; JSONB payloads carry no decimals that mean money.
