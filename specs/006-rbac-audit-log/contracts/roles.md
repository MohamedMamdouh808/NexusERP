# Contract: Roles and Permissions Endpoints

Permission on every route: `roles.manage`. Base URL `/api/v1`. Role addressing is org-scoped: a role of another organization → 404 (FR-022). Five system roles (`isSystem = true`) are read-only (FR-013).

## GET /api/v1/roles

Response 200 (all roles of the active organization, each with its permission codes):

```json
{
  "roles": [
    { "id": "…", "key": "sales", "name": "Sales", "description": "…", "isSystem": true,
      "permissions": ["sales.view", "quotes.manage"] }
  ]
}
```

Exactly the five template roles right after provisioning (US1 acceptance).

## GET /api/v1/roles/permissions

Returns the system permission catalogue (all 25 seeded rows):

```json
{ "permissions": [ { "code": "users.manage" } ] }
```

(Unchanged reference data — exposed so UIs never hardcode codes.)

## POST /api/v1/roles

Creates a custom role. Request (Zod, strict):

```json
{ "name": "Support", "key": "support", "description": "…", "permissionCodes": ["quotes.view"] }
```

Validation/behavior (single transaction):
- `permissionCodes` referencing a nonexistent catalogue code → 400 `VALIDATION_ERROR` naming `permissionCodes`.
- Name collision case-insensitively within the same organization → 409.
- Open catalogue (clarified Q5): any existing permission may be held, including administrative ones.
- No-escalation (FR-031): resulting permission set ⊆ actor's effective set, else 403 `NOT_ENOUGH_PERMISSIONS` naming the missing permission.
- Audit `roles.created` (record: role id; before null; after = name + full permission set).

Response 201: role projection (as GET item, with `permissions`).

## PUT /api/v1/roles/:id

Updates a custom role's name, description and permission set (full replace of the set).

- System role → 403 (no state change).
- Same validations as POST (collision 409, unknown codes 400 permission-naming).
- Escalation: resulting set ⊆ actor's effective set, else 403 `NOT_ENOUGH_PERMISSIONS`. **Editing down below the actor's own held set is allowed** — including to the operator's subset; the target role may even sit below the actor after the edit.
- Audit `roles.updated` (record: role id; before/after = name + full permission sets).

Response 200: role projection.

## DELETE /api/v1/roles/:id

- System role → 403.
- Assigned to any membership (of this organization) → 409; nothing changes.
- Else: role and its `role_permissions` links removed in one transaction; audit `roles.deleted` (record: role id; before = name + permission set; after null). Audit trail keeps its JSON copies — references remain readable (US4 scenario 3).

Response 200: `{ "deleted": true }`.

## Administrator-catalogue invariant (FR-032)

The `Administrator` system role of every organization always holds the entire catalogue. The provisioning sync routine (AccessControl) runs on registration and is invoked by any platform work that adds a catalogue permission; a test inserts a permission and proves every Administrator role gains it (SC-016). This is platform-work duty, not an endpoint.

## Audit entries produced here

| Action code | record_type | record_id |
|---|---|---|
| `roles.created` | role | role id |
| `roles.updated` | role | role id |
| `roles.deleted` | role | role id |
