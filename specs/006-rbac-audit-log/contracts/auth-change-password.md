# Contract: POST /auth/change-password (extends docs/api-auth-contract.md)

Authenticated, state-changing (CSRF-protected via `X-CSRF-Token` like all mutating endpoints). Session required. To be mirrored into `docs/api-auth-contract.md` when implemented.

## Request

```json
{ "currentPassword": "…", "newPassword": "…" }
```

Zod, strict: both required strings.

## Validation order and responses

1. **Current password verification** — `argon2.verify` against the user's hash.
   - Wrong → **400** `INVALID_CURRENT_PASSWORD` (NEVER 401 — the session is valid; this is a body validation). Counts toward the failed-verification limiter **keyed by user id** — more than 5 wrong verifications within 15 minutes → **429** with `Retry-After` (same visible-wait shape as failed sign-ins). Failures audited as `auth.password_change_failed` (entry: user id, no org, no password/hash values).
   - Unknown current-user session state is handled by SessionGuard (401) before this point.
2. **New password policy** — same as registration (≥12 chars, upper/lower/digit); must differ from the current password; must not equal the user's email (case-insensitive). Violations → 400 `VALIDATION_ERROR` with `details[].field = "newPassword"` naming the rule.

## Success (single transaction)

1. Update the password hash (Argon2id).
2. Clear `users.must_change_password`.
3. Invalidate **all other sessions of the user in every organization** (delete rows).
4. Rotate the current session: delete + recreate with a fresh token and CSRF token; fresh cookies (`session_id`, `csrf_token`) replace the old — the previous cookie stops working immediately; the user stays signed in on the current device.
5. Audit `auth.password_changed` (record: user id; no password/hash/token values in entry or logs).
6. Response 200:

```json
{ "message": "Password changed." }
```

plus new cookies. `GET /auth/me` afterwards shows `mustChangePassword: false`.

## Forced password-change gating (FR-028)

While `must_change_password` is set for the session's user:

| Allowed | Refused |
|---|---|
| `POST /auth/change-password` | everything else — 403 `PASSWORD_CHANGE_REQUIRED` (new code, 403), including permission-held endpoints |
| `GET /auth/me` | |
| `POST /auth/logout` | |

The gate is a guard outstanding ahead of permission resolution (a pending member must not pass permission checks even on held permissions). `GET /auth/me` exposes the flag so callers can route to the change form:

```json
{ "user": { "…", "mustChangePassword": true }, "membership": { "…" } }
```

The flag first becomes non-false for a member created with an initial password (member creation path); sign-in succeeds with the initial password and states the pending change.

## New shared error code

| Code | Status | Catalogued message |
|---|---|---|
| `INVALID_CURRENT_PASSWORD` | 400 | "The current password is incorrect." (exact wording at implementation) |
| `PASSWORD_CHANGE_REQUIRED` | 403 | "You must change your password before continuing." (exact wording at implementation) |

## Audit entries produced here

| Action code | record_type | record_id | payload |
|---|---|---|---|
| `auth.password_changed` | user | user id | no password/hash/token values |
| `auth.password_change_failed` | user | user id | reason code only |
