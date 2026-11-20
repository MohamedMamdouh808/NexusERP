# Quickstart: Users & Roles and Change-Own-Password

## Prerequisites
- Dev stack running (`npm run dev`): API on :3000, web on :5173.
- Signed in as an Administrator (or any member holding `users.manage` / `roles.manage`).
- Database migrated (public schema must include the memberships `name`/`version` columns).

## Walk-through

1. Open `/users`. Confirm the list loads from the real backend (no Sample data banner). Search by a name fragment; filter by role and by status; change sort and page size; confirm the total updates.
2. Open "New user", enter name, email, a 12-character password, and at least one role; submit. Confirm the toast: "The member was added. If this person already had an account, they keep their existing password." Verify the password never appears in the UI or network response.
3. Open "Edit roles" for a member; toggle roles; confirm the permission count and grouped permission preview update live; save. Confirm a member with no held permission shows it disabled with "You can only grant permissions you hold".
4. Deactivate a member via the kebab menu; confirm the ConfirmDialog states the consequence; confirm the member becomes DEACTIVATED and can no longer sign in. Reactivate and confirm access returns.
5. Open `/users/roles`; confirm system roles show "System roles cannot be edited" with a read-only grouped checklist. Create a custom role, edit it, delete an unassigned one; attempt to delete an assigned one and confirm the refusal names the member count.
6. Attempt to deactivate the last active Administrator; confirm the inline refusal "At least one active Administrator is required".
7. Open `/account/password` from the user menu; change password with a wrong current password → 400 `INVALID_CURRENT_PASSWORD`, still signed in. Then change with the correct current password → toast confirms, session rotates, still signed in.
8. Sign in as a newly created member (mustChangePassword true); confirm redirect to `/account/password`, shell shows only that page and Sign out, and other routes redirect back.

## Verification commands

- Backend typecheck: `npm run typecheck --workspace @nexuserp/api`
- Frontend typecheck: `npm run typecheck --workspace @nexuserp/web`
- Backend integration (isolated schema): `cd backend && npx jest --selectProjects integration --runInBand --testPathPattern 'users-roles'`
- Invariants: `npm run verify:invariants` (public) and `npm run verify:invariants:test` (isolated)