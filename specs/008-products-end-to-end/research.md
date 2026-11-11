# Research & Design Decisions: Products End to End

## Decision 1 - The three tables and their keys

- **Decision**: `products`, `product_categories` and `units_of_measure`, each
  with `organization_id UUID NOT NULL`, a composite unique key
  `(organization_id, id)`, and composite foreign keys to `organizations(id)`.
  A product references its category and its unit with composite foreign keys
  over `(organization_id, id)`, so a product can never point at another
  organization's category or unit.
- **Rationale**: Principle I asks for the composite key on every
  organization-owned table, and the contacts table already shows the shape:
  `@@unique([organizationId, id])` plus a composite reference. A single-column
  foreign key on the category would let a product name another organization's
  category, which is exactly the leak the composite key makes impossible.
- **Alternatives considered**: a single-column reference to the category with
  the tenant checked in the query. Rejected: the check is then the
  application's job, and a query that forgets it leaks. The composite key
  makes the mistake impossible to write.

## Decision 2 - SKU uniqueness, and how it is enforced

- **Decision**: A unique index over `(organization_id, LOWER(sku))`. The SKU is
  trimmed before it is stored, and the index covers archived products too, so
  an archived product keeps its SKU reserved.
- **Rationale**: The specification requires case-insensitive uniqueness per
  organization and requires archived products to keep their SKU. A unique
  index is the only form of that rule that survives two people saving the same
  SKU at the same moment: a check-then-insert in the service answers "unique"
  to both of them and the second insert fails on the index anyway, as a
  database error the caller never sees. The index makes the second save fail
  with the duplicate-record outcome the caller understands.
- **Alternatives considered**: the contacts pattern of a `findFirst` check in
  the service before the insert. Rejected for the race above; it is kept for
  the advisory duplicate-NAME notice, where a race is harmless because the
  answer is advice, not a refusal.

## Decision 3 - The name is not unique

- **Decision**: No unique index on the name. The create form shows a
  non-blocking notice when another product in the organization has the same
  name, naming that product's SKU and linking to it, and the save proceeds.
- **Rationale**: A name is how a person recognises a product; the SKU is how a
  business document identifies one. Two products legitimately share a name -
  the same item in two colours - and variants are explicitly out of scope, so
  those are two products. A unique index on the name would refuse them, and
  removing it later would need a migration. The advisory notice protects the
  user from the accident without refusing the legitimate case, and every list
  shows the SKU beside the name so the two stay distinguishable.
- **Alternatives considered**: a unique index on `(organization_id,
  LOWER(name))`. Rejected for the reason above. A soft warning as an error
  (a refusal with a hint) was also rejected: it would refuse the legitimate
  case and turn advice into a block.

## Decision 4 - Prices and the reorder level

- **Decision**: `purchase_price NUMERIC(14,4) NOT NULL`, `selling_price
  NUMERIC(14,4) NOT NULL` and `low_stock_threshold NUMERIC(14,3) NULL`, each
  with a `CHECK (column >= 0)`. The values cross the interface as decimal
  strings; a value sent as a number is refused.
- **Rationale**: The repository's decimal convention fixes four places for
  unit prices and three for quantities, and the specification names the same
  precisions. The reorder level is nullable rather than zero because "no
  threshold" and "a threshold of zero" are different statements, and the
  inventory feature compares the level against a quantity that does not exist
  yet. A number in the JSON body is refused because a JSON number is a
  double in every parser, and the value would already have lost precision by
  the time the service read it.
- **Alternatives considered**: storing the prices as text. Rejected: the
  database could no longer compare or aggregate them, and the repository's
  convention is a numeric type with a string on the wire.

## Decision 5 - Optimistic concurrency, and where the version lives

- **Decision**: The product carries a `version INTEGER NOT NULL DEFAULT 1`.
  An update carries the version it was read at and is applied only when that
  version still holds; the accepted change increments it. The same shape the
  contacts table uses.
- **Rationale**: Two operators editing the same product is ordinary in an ERP,
  and a silent overwrite loses a price or a threshold that cannot be
  reconstructed. A version the caller must carry makes the conflict the
  caller's to see, and the refusal is specific ("this changed since you
  opened it") rather than a generic failure.
- **Alternatives considered**: a lock for the duration of the edit. Rejected: a
  lock held across a human's typing time blocks everyone else and is lost when
  the browser closes. Last-write-wins was rejected outright: it is the silent
  overwrite the requirement exists to prevent.

## Decision 6 - No stock rows, and where the dependency is made explicit

- **Decision**: No stock table, no stock column, and no balance row is created
  for a product. The inventory feature creates the balance lazily on the first
  movement for a product and a warehouse, and a later reader treats a missing
  balance as zero on hand and zero reserved. The product detail screen shows no
  stock figure, and a clearly labelled "Stock arrives with Inventory" note is
  acceptable.
- **Rationale**: The specification places inventory stock out of scope, and the
  PRD's own wording creates the balance "on first movement" - which is the
  inventory feature's event. Creating a zero-quantity balance table here would
  put a second, weaker version of the inventory model in place for that
  feature to inherit, and a row with no quantity in it carries no information
  worth storing early.
- **Alternatives considered**: creating a zero-quantity balance row per
  warehouse now. Rejected for the reason above. Storing a computed "low
  stock" flag on the product was rejected outright: stock changes without the
  product changing, so a stored answer to it is wrong the moment the stock
  moves.

## Decision 7 - The archive usage check is a seam

- **Decision**: An injectable `ProductsUsageHook` with
  `isInUse(organizationId, productId)` returning `{ inUse: boolean }`. The
  default implementation reports that nothing is in use; the purchasing, sales
  and inventory features will provide the real one. The refusal (409
  `PRODUCT_IN_USE`) is proven by a test that makes the hook report a product
  in use.
- **Rationale**: The refusal is a real rule - a product with open documents or
  reserved stock must not disappear from the catalogue - but the documents that
  define "in use" do not exist yet. A seam lets the rule be enforced now, in
  the product module, without the product module knowing anything about
  purchase orders, sales orders or reserved stock. The same shape the contacts
  feature uses for its own usage check.
- **Alternatives considered**: the products module querying the future
  documents directly. Rejected: it would create a dependency from products to
  three modules that do not exist, and the circular dependency the constitution
  forbids.

## Decision 8 - The organization's currency is a stored setting

- **Decision**: `organizations.currency_code VARCHAR(3) NOT NULL DEFAULT 'USD'`,
  added by a new migration, with existing organizations backfilled to `USD` and
  new organizations receiving it in the same transaction that creates them. The
  identity feature exposes it read-only on the identity answer and the
  current-organization answer. Products carry no currency column. Changing the
  currency is out of scope; the rule that the currency locks once an order or
  an invoice exists belongs to the feature that owns those documents.
- **Rationale**: Prices have to be shown with a currency, and the currency
  applies to the whole organization rather than to one product. Storing it
  once, on the organization, keeps it out of every product row and keeps the
  product table free of a setting that is the same for all of them. The
  interface formats the decimal string with the code and performs no
  conversion and no arithmetic on money.
- **Alternatives considered**: a currency column on each product. Rejected: it
  would allow one catalogue to hold several currencies, which is not what the
  business does, and every product would carry a value that is the same as its
  neighbours'. Storing no currency at all was rejected: the interface would
  show a number with no unit, which is the kind of quiet ambiguity this
  product refuses elsewhere.

## Decision 9 - The default units of measure

- **Decision**: Every new organization receives four units of measure in the
  transaction that creates it: unit (unit), pair (pair), roll (roll) and box
  (box). A migration backfills the organizations that already exist.
- **Rationale**: A product cannot be created without a unit of measure, so an
  organization that starts empty cannot create its first product. The four
  cover the everyday trading goods, and because they belong to the
  organization, they can be renamed or added to later. The backfill is
  idempotent: a unit that already exists by name is left alone.
- **Alternatives considered**: a single global unit table shared by every
  organization. Rejected: it breaks the tenant model - one organization
  renaming a unit would change it for every other organization, and the
  uniqueness rules the specification states are per organization.

## Decision 10 - Searching, filtering and the default status

- **Decision**: The list searches the SKU and the name with the wildcard
  characters (`%`, `_`, `\`) escaped, filters by category and by status, and
  sorts by name, SKU or creation time. The status filter offers Active,
  Archived and All; when no status is asked for the service answers with the
  active products. The interface shows which filter is in force.
- **Rationale**: The catalogue is searched where the data lives, because a
  browser cannot hold ten thousand products. Escaping matters because a search
  term is text the user typed, not a pattern they wrote; `%` in a search term
  must find the products that contain a percent sign. The default of active
  matches the pattern the contacts list already established, so the two screens
  behave alike, and showing the filter means the default is never a hidden
  rule.
- **Alternatives considered**: searching the category name as well. Rejected:
  the specification names the SKU and the name, and a category is a filter of
  its own.

## Decision 11 - The audit trail

- **Decision**: Six new audit actions - `products.created`, `products.updated`,
  `products.archived`, `products.restored`, `product_categories.created` and
  `units_of_measure.created` - recorded through the same audit seam the
  contacts feature uses, in the same transaction as the change, with the values
  before and after. A creation records an empty "before"; an archive and a
  restore record the archived flag on both sides.
- **Rationale**: An audit entry written outside the change's transaction can
  outlive a change that was rolled back, so the entries would describe
  something that never happened. The audit log is append-only at the database
  level, so a written entry is a fact.
- **Alternatives considered**: auditing in the service but outside the
  transaction. Rejected: the audit entry and the change would disagree after
  any failure.

## Decision 12 - The interface reads the real service

- **Decision**: A real client behind the service seam
  (`frontend/src/services/products-client.ts`), a React Query hook file
  (`use-products.ts`), and the four product screens reading them. The sample
  products and the sample service methods they used are deleted, and the
  sample-data banner leaves those screens. The modules that still use
  demonstration data keep their own demonstration product list, show product
  references as plain text, and never call the real product service.
- **Rationale**: The product screens are used every day; leaving them on
  demonstration data while the service is real would show the organization the
  wrong numbers and invite decisions on them. The other modules are not real
  yet, so a link from a sample invoice to a product that does not exist would
  be a dead end; plain text is honest, and it keeps the sample modules from
  calling a service whose answers they have no business showing.
- **Alternatives considered**: migrating the other modules to the real service
  in this feature. Rejected: that is the purchasing, sales and invoicing
  features, and doing it here would put the real catalogue into demonstration
  documents.
