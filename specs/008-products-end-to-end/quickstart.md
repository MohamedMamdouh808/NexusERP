# Quickstart: Products End to End

How to run and verify the products feature by hand.

## 1. Prepare the database

The feature adds three tables and one column. Apply the migrations to the
schema you develop against:

```bash
# The hosted database (the connection string is in .env).
npm run db:migrate
```

The migration is schema-neutral: it creates its objects in the schema the
migration is applied to, so the isolated test schema and the shared schema
stay in parity.

To rebuild the isolated test schema from scratch instead (drop it, recreate
it, apply every migration):

```bash
node scripts/reset-test-schema.mjs --migrate
```

## 2. Run the service and the interface

```bash
npm run dev:api     # the service on :3000
npm run dev:web     # the interface on :5173
```

## 3. Verify by hand

1. Sign in as a member of an organization that has no products.
2. Open **Products**. The list is empty and offers "New Contact"-style
   creation: the empty state explains what the list holds.
3. Open **New Product**. The organization's default units of measure - `unit`,
   `pair`, `roll`, `box` - are offered as the choices for "Unit of measure"
   (nothing is preselected: a product needs an explicit choice). Categories
   start empty per organization: add the first one with the inline "Or add a
   category" field, or pick one once it exists.
4. Save a product with a SKU, a name, a category, the unit, a purchase price
   and a selling price. The confirmation names the product, and it appears in
   the list with its SKU beside its name.
5. Save a second product with the same SKU in different capitalisation. The
   save is refused, the SKU field is marked, and the conflicting product is
   named.
6. Save a product whose name matches an existing one. The form shows a
   **notice** naming that product's SKU, and the save still succeeds.
7. Try to save a price with five decimal places, a negative price, or a price
   written as a number. Each is refused, and the offending field is marked.
8. Open the product and change the selling price. The version increases.
9. Open the same product in two windows, change it in the first, then save the
   second. The second save is refused with the stale-version outcome, and the
   screen offers to reload.
10. Archive the product. It leaves the active list, carries an Archived badge
    where it still appears, and stays reachable by its direct link. Restore it.
11. Search for a product whose name contains `%`. The percent sign is matched
    literally, not as a wildcard.
12. Filter by status "All" and by a category. The list and its total follow
    the filter, and the filter in force is visible.
13. Sign in as a member without `products.write` - for example a Sales-role
    member (`products.read` only). Their screens show no create, edit or
    archive control; the list and the detail page still load; a row's kebab
    offers only "View". If the member was created for them, its first sign-in
    requires choosing a new password.

## 4. Verify the guards

```bash
npm run check:naming             # every new table and column is snake_case
npm run check:migrations         # the applied history matches the repository
npm run check:rls                # every table has row level security
npm run verify:invariants        # the shared schema's invariants
npm run verify:invariants:test   # the isolated schema's invariants
node scripts/check-schema-lint.mjs   # the lint's warning classes
```

## 5. Verify the tests

```bash
# The integration suite runs only in the isolated schema, which is rebuilt
# from the current migrations before the first suite.
node scripts/with-test-schema-env.mjs npm run test:integration -- products

# The interface's tests.
npm run test --workspace @nexuserp/web
```

The public schema's row counts must be identical before and after a run. Take
the two snapshots around a run and compare them:

```bash
node scripts/snapshot-public-counts.mjs > before.txt
node scripts/with-test-schema-env.mjs npm run test:integration
node scripts/snapshot-public-counts.mjs > after.txt
diff before.txt after.txt && echo "the shared schema was untouched"
```

## 6. The append-only proof

The audit trail is append-only at the database level. The proof runs in the
isolated schema and refuses to touch the shared one:

```bash
node scripts/with-test-schema-env.mjs node scripts/prove-audit-protection.mjs
```

It inserts one proof row and then shows that UPDATE, DELETE and TRUNCATE are
all refused - the last one even with the privilege granted.
