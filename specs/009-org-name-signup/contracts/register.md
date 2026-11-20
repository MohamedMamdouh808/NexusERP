# Contract Delta: POST /api/v1/auth/register

Canonical contract: `docs/api-auth-contract.md` (updated by this feature). This file records the delta only.

## Request (delta)

```jsonc
{
  "email": "user@example.com",          // unchanged
  "password": "…",                       // unchanged
  "organizationName": "Acme Logistics"   // OPTIONAL, new — trimmed, 2–128 chars
}
```

Validation rules:

- Absent → today's behavior; the organization is named `${email}'s Organization`.
- Present → `trim()` then length must be in `[2, 128]`; otherwise `400` with
  `details: [{ field: "organizationName", message: "…" }]` and zero records created.
- `.strict()` is retained: no other keys are accepted.

## Response (unchanged)

The response body (user, organization, membership) is unchanged. No new field is added to the response; clients keep reading the organization name exactly as they do today.

## Error responses (delta)

| Case | Status | Body | Records created |
|------|--------|------|-----------------|
| `organizationName` too short / too long / whitespace-only / control chars | 400 | `{ code, message, details: [{ field: "organizationName", … }], requestId }` | none |
| absent | 200/201 | today's response | yes (placeholder name) |

## Security notes

- Strictly additive, optional field on a public route; grants no authority.
- Server-side trim and length validation only (Constitution Principle II/III).
- The organization name is user content; it is returned verbatim and is never interpreted, translated or re-cased by the service or the interface.
