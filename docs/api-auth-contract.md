# Auth API Contract (NexusERP)

Source of truth: the code in `backend/src/modules/auth/` (controller, service,
guards, DTO schemas) and the regenerated committed artifact
`backend/openapi.json` (regenerate with `npm run openapi:generate --workspace @nexuserp/api`;
`contract-drift.spec.ts` fails CI when the two disagree).

> The committed `openapi.json` had drifted out of documentation while the auth
> feature was added (it contained no `auth` paths). It was regenerated on
> 2026-11-08 and currently covers all six endpoints below.

Base URL: `/api/v1` (global prefix). All request/response bodies are
`application/json; charset=utf-8`. Every failure response uses exactly the
shared envelope:

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Some fields need attention.",
  "details": [{ "field": "email", "code": "VALIDATION_ERROR", "message": "Invalid email address." }],
  "requestId": "3f6c1d2e-9a4b-4c1f-8e77-2b5d9a0c1e33"
}
```

- `code` — stable machine-readable code (branch on it, never on `message`).
  Status mapping: 400 `VALIDATION_ERROR`, 401 `UNAUTHENTICATED`, 403 `FORBIDDEN`,
  404 `NOT_FOUND`, 409 `CONFLICT`, 429 `TOO_MANY_REQUESTS`, 500 `INTERNAL_ERROR`.
- `message` — catalogued default, safe to display verbatim. A plain thrown
  message (e.g. "Invalid email or password.") is normalized to the catalogued
  default by the global `AllExceptionsFilter` (FR-021/FR-026): e.g. login
  failures always surface as `"Record not found."`.
- `details` — `field` (dotted path) only filled for 400s.
- `requestId` — identical to the `x-request-id` response header.

## Cookies

| Cookie       | Flags                                                                 | Purpose |
|--------------|-----------------------------------------------------------------------|---------|
| `session_id` | `HttpOnly`; `SameSite=Lax`; `Path=/`; `Secure` only in production      | The raw opaque session token. The DB stores only its SHA-256 hash (`sessions.tokenHash`). |
| `csrf_token` | readable by JS; `SameSite=Lax`; `Path=/`; `Secure` only in production  | Companion token to be sent as the `X-CSRF-Token` header on state-changing requests. |

⚠ **CSRF enforcement is not yet wired**: the token is issued and expected to be
sent as `X-CSRF-Token`, but no server-side validation middleware consumes it
yet (planned before any cross-site exposure; same-origin dev is not exposed).

⚠ **`Secure` is off in development** so cookies work on plain HTTP
`localhost:5173` → `localhost:3000` through the Vite proxy.

## Sessions (server-side)

- Token: 32 random bytes, hex-encoded (64 chars). Cookie carries the raw token;
  database stores only `sha256(token)`.
- Absolute expiry: `expiresAt = createdAt + 12h`, enforced in `SessionGuard`
  (expired sessions are deleted on touch, then 401).
- Idle expiry: `lastUsedAt` is refreshed on every authenticated call, but the
  30-minute idle timeout is **not yet enforced** (planned check:
  `now - lastUsedAt > 30min → delete + 401`).
- Membership liveness: the membership attached to the session must be
  `isActive`; otherwise 401 (`SessionGuard`).
- Rate limiting: the `login_attempts` table exists, but the 5-failures/15-min
  → 429 + `Retry-After` rule is **not yet enforced**.

## Endpoints

### POST /api/v1/auth/register — public

Creates, in ONE transaction: user (Argon2id hash), first organization,
Administrator membership (`roleKey: "administrator"`, active), default
warehouse, default `invoice` document sequence, and the first session.

Request:

```json
{ "email": "user@example.com", "password": "Password123" }
```

Validation (Zod, strict — unknown keys rejected): valid email; password ≥ 12
chars with at least one uppercase, one lowercase, one digit.

Responses:

| Status | Body | Notes |
|--------|------|-------|
| 201    | `{ user: { id, email }, organization: { id, name: "<email>'s Organization" }, membership: { id, roleKey }, session: { id }, sessionToken, csrfToken }` | `sessionToken`/`csrfToken` are returned ONCE here; no cookies are set on this endpoint. |
| 400    | envelope `VALIDATION_ERROR` with `details[].field` = `email`/`password` | |
| 409/500 | duplicate email currently produces 500 (`INTERNAL_ERROR` with `requestId`) | **Known gap**: duplicate email is not yet mapped to `CONFLICT`; do not rely on it. |

### POST /api/v1/auth/login — public

Verifies Argon2id hash (dummy verify on unknown email to avoid timing leaks,
FR-010). Issues BOTH cookies (`session_id`, `csrf_token`).

Request: `{ "email": "...", "password": "..." }` (Zod: valid email, non-empty
password).

Responses:

| Status | Body | Notes |
|--------|------|-------|
| 200    | `{ user: { id, email }, membership: { id, roleKey, organization: { id, name } } }` | Tokens are in the cookies, NOT in the body. |
| 404    | envelope `NOT_FOUND`, message `"Record not found."` | Wrong password and unknown email are indistinguishable by design (same status, same generic message, FR-010). The service throws `NotFoundException`; the filter normalizes the message. The spec's intent is a generic 4xx; today it is **404** — the frontend must treat any failure as "invalid email or password" without branching on status. |
| 400    | envelope `VALIDATION_ERROR` | Malformed body. |

⚠ The spec intent is a generic 4xx for failed login; today it is **404**. The
frontend must treat any failure ≠ valid as "invalid email or password" without
branching on status.

### POST /api/v1/auth/logout — requires session

Purpose: invalidate the session server-side and clear both cookies; expected
response 200 `{ "message": "Logged out." }` with `Set-Cookie` clearing headers.

⚠ **Currently unreachable**: the route has no `@Public()` and no
`@RequirePermission(...)`, so the global default-deny `PermissionGuard` rejects
it with 403 `FORBIDDEN` **even with a valid session** (`PermissionGuard`
resolves no effective permissions anywhere yet — see the roles/permissions
report). The frontend must not depend on the logout endpoint until this is
fixed (either `@Public()` + `SessionGuard` only, or wiring permission
resolution).

### GET /api/v1/auth/me — requires session (`@Public()` + `SessionGuard`)

Response 200:

```json
{
  "user": { "id": "…", "email": "…" },
  "membership": { "id": "…", "roleKey": "administrator", "isActive": true },
  "organization": { "id": "…", "name": "…" }
}
```

Errors: 401 `UNAUTHENTICATED` without cookie / invalid / expired / inactive
membership. This endpoint is the frontend's "am I signed in?" probe.

### GET /api/v1/auth/organizations — requires session (`@Public()` + `SessionGuard`)

Response 200: array of active memberships for the org switcher:

```json
[
  { "id": "<organizationId>", "name": "<organization name>", "roleKey": "administrator" }
]
```

Errors: 401 `UNAUTHENTICATED`.

### POST /api/v1/auth/switch-organization — requires session

Request: `{ "organizationId": "<uuid>" }` (Zod: uuid, strict). Switches every
active session row of the user to the target membership; tenant scope then
follows the session.

Responses: 200 with `{ membership: { id, roleKey }, organization: { id, name } }`
— ⚠ the service currently returns `name: <organizationId>` (a defect: the
organization's real name must be fetched instead). 403 if the user lacks an
active membership in the target organization — ⚠ currently pre-empted by the
same default-deny gap as logout (403 for every caller).

## Client rules (frontend)

1. Probe sign-in state with `GET /api/v1/auth/me`; 401 ⇒ signed-out UI, 200 ⇒
   org switcher + profile menu.
2. Send `credentials: 'same-origin'` (or `'include'`) on every call so the
   `session_id` cookie round-trips (works same-origin through the Vite proxy).
3. After login/register, read `csrf_token` and send `X-CSRF-Token` on
   state-changing calls once enforcement exists.
4. On 401, clear any local signed-in state and show the signed-out UI.
5. Treat `code` (not `message`) as the branch key; `requestId` is what support
   users quote.
