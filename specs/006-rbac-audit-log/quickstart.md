# Quickstart: RBAC and Audit Log

From the repository root (Windows PowerShell). Requires a local PostgreSQL and `.env` with `DATABASE_URL` pointing at a database you are willing to have migrated and truncated.

## 1. Migrate and generate

```powershell
npm run db:migrate:dev          # applies the new <timestamp>_rbac_audit_log migration (create + backfill)
npm run db:generate             # regenerate the Prisma client for the new models
npm run db:seed                 # reference data (idempotent)
```

The migration is idempotent: re-running `migrate deploy` (or the backfill SQL portion twice) creates no duplicate roles or links (SC-008). It never edits an applied migration file — `npm run check:migrations` fails if a committed migration's content no longer matches its recorded checksum (FR-024).

## 2. Run the guards after implementing

```powershell
npm run check:migrations                        # migration history + checksum immutability (FR-024)
npm run check:rls                               # RLS enabled, no policies, incl. new tables (FR-023)
npm run check:schema-numeric-types
npm run check:boundaries
npm run check:structure
npm run check:secrets
npm run openapi:generate --workspace @nexuserp/api   # regenerate backend/openapi.json in the same change
npm run test:integration                        # real-PostgreSQL suite (Jest + Supertest)
npm run openapi:diff                            # contract drift (SC-009)
```

## 3. Walk the happy path (dev API on :3000)

```powershell
npm run dev:api
```

1. `POST /api/v1/auth/register` — the new organization now materializes **five roles** with permission links in the same transaction; audit entries `auth.register` and `roles.catalogue_provisioned` exist.
2. Sign in as a second user via member creation instead: as the first Administrator, `POST /api/v1/memberships` with an existing role id, an initial password, and a name. Sign in as that member with the initial password — `PASSWORD_CHANGE_REQUIRED` gates every endpoint except `POST /auth/change-password`, `GET /auth/me`, and logout; change the password (rotate happens server-side; cookies refresh).
3. Replace a member's roles with `PUT /api/v1/memberships/:id/roles` — one audit entry carries the before/after role sets; the next request under the new permissions needs no re-login.
4. Deactivate a member — their existing session stops working; the last active Administrator can never be deactivated or lose the Administrator role (409 `LAST_ADMINISTRATOR`).
5. Create/edit/delete a custom role under `roles.manage` — the no-escalation rule refuses sets beyond your own effective permissions; system roles refuse modification; deleting an assigned role is refused, deleting an unassigned custom role succeeds.
6. List the audit log as a user holding `audit.read`: filters (period/user/action/record), paging with total; a second organization's user sees none of yours. Attempt `UPDATE`/`DELETE`/`TRUNCATE` against `audit_logs` with the application role — all rejected by the database.
7. Fail a login 6 times (or a change-password verification) — the 6th within 15 minutes answers 429 with `Retry-After`; the audit table gains exactly one first-failure entry plus the lockout entry, never the raw submitted email.

## 4. What "done" looks like

All SC-001…SC-016 tests pass against real PostgreSQL, all guards green, `openapi.json` regenerated in the same change, contract docs updated (`docs/api-auth-contract.md` for the auth extensions).
