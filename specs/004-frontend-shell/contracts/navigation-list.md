# Contract: Navigation list

The one typed navigation list the shell renders and the sidebar's tests assert against, mirrored
by a plain table in `design-system/nexuserp/MASTER.md` and compared by one test (spec FR-064,
FR-065).

Live location: `frontend/src/components/shell/navigation.ts`.
Mirror: `design-system/nexuserp/MASTER.md` — a plain table of group, label, state.

## Shape

```ts
export type NavGroupName = 'General' | 'Management' | 'Settings';
export type NavEntryState = 'available' | 'Soon';

export interface NavEntry {
  readonly label: string;            // verbatim from the navigation table (FR-064)
  readonly group: NavGroupName;
  readonly state: NavEntryState;
  readonly path: string | null;      // present only when state === 'available'
  readonly reason: string | null;    // required when state === 'Soon'; also the tooltip text
  readonly permission: string | null; // recorded intent only — nothing is filtered client-side
}

export interface NavGroup {
  readonly name: NavGroupName;
  readonly entries: readonly NavEntry[];
}

/** Order of groups and of entries within a group is authoritative (FR-064). */
export const NAVIGATION: readonly NavGroup[];
```

## Initial contents (authoritative)

| Group | Entry | State |
|-------|-------|-------|
| General | Overview | available |
| General | Sales Orders | Soon |
| General | Inventory | Soon |
| General | Reports | Soon |
| Management | Products | Soon |
| Management | Customers & Suppliers | Soon |
| Management | Purchasing | Soon |
| Management | Invoicing | Soon |
| Management | Users & Roles | Soon |
| Settings | Organization | Soon |
| Settings | Audit Log | Soon |
| Settings | System Health | available |

Surfaces omitted entirely (not present in the model at all, not even as `Soon`): Billing &
Subscription, Integrations, Upgrade Plan, Help & Support, global search, notifications
(FR-067, FR-016).

## Rules

1. **Exactly two available.** Overview and System Health; every group holds at least one entry
   (FR-067, SC-016).
2. **A `Soon` entry cannot be activated** by mouse, keyboard or assistive technology, and
   carries its reason as a tooltip (FR-007).
3. **The active destination** is the only entry marked `aria-current="page"` (FR-009).
4. **`permission` is recorded intent.** Nothing is filtered or guarded on the client
   (FR-015, Principle II).
5. **The master file's table mirrors this.** A change to one side only must fail the comparison;
   a later feature flipping a module to available changes both in the same commit and the
   sidebar tests pass (FR-065, FR-066).

## Verification

- `navigation-master-file.spec.ts` parses the master file's table and compares groups, labels,
  order and states with `NAVIGATION`; it is shown failing on purpose when an entry is added,
  removed or flipped in only one place (FR-065, SC-015).
- `router.spec.tsx` asserts every `available` entry's `path` resolves to a route (FR-007,
  extending the existing exported `routes`).
- `sidebar.spec.tsx` asserts exactly one `aria-current="page"` and that `Soon` entries are
  inoperable.
