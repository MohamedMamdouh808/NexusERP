# Quickstart & Verification Guide: Contacts End to End

This guide outlines steps for manual and automated verification of the Contacts module.

## 1. Automated Integration Tests

Run the integration suite in the isolated `nexuserp_test` schema:
```bash
npm run test:integration -- backend/test/integration/contacts.spec.ts
```

Key verification checks in the test:
- **Tenant Isolation**: Querying contact from Organization A with Organization B session yields 404.
- **Role Permissions**: Request without `contacts.write` (e.g., standard viewer) yields 403 on mutation endpoints.
- **Duplicate Email Uniqueness**: Creating duplicate email case-insensitively (`test@acme.com` vs `TEST@acme.com`) yields 409 `DUPLICATE_RECORD`.
- **Optimistic Locking**: Updating with mismatched `version` yields 409 `STALE_VERSION`.
- **Usage Hook**: Archiving with a stub returning `inUse: true` yields 409 `CONTACT_IN_USE`.
- **Audit Logs**: Verified that `contacts.created`, `contacts.updated`, `contacts.archived`, and `contacts.restored` rows are created with matching `recordId` and `before`/`after` states.

## 2. Invariant & Quality Guard Verification

Run all required repository invariant checks:
```bash
npm run check:migrations
npm run check:rls
npm run check:boundaries
npm run check:structure
npm run check:secrets
node scripts/verify-db-invariants.mjs
```

## 3. Manual Frontend Smoke Test

1. Start backend and frontend:
   ```bash
   cd backend && npm run dev
   cd frontend && npm run dev
   ```
2. Log into the web application at `http://localhost:5173`.
3. Navigate to **Contacts** (`/contacts`).
   - Confirm **Sample Data** banner is **NOT** displayed on this page.
4. Click **New Contact**.
   - Enter Name, check Customer, fill address details.
   - Click **Create Contact**.
   - Verify contact details screen renders with assigned code `CUST-00001`.
5. Click **Edit Contact**.
   - Update phone and check Supplier as well (both checked).
   - Save and confirm updated details.
6. Return to `/contacts` list:
   - Test search, role filter (`Customer`, `Supplier`), and status filter (`Active`, `Archived`).
   - Test Archiving and Restoring the contact.
7. Navigate to `/sales`, `/purchasing`, `/invoicing`:
   - Confirm that their pages continue to function with sample data and their "Sample data" banner intact.
