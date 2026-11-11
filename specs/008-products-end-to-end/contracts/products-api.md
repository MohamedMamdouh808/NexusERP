# Products API Contract

Every endpoint lives under `/api/v1`, requires a valid session, and answers in
the shared error envelope `{ code, message, details, requestId }`.

Permissions: `products.read` for the lists and the reads, `products.write` for
every change. A member without the write permission is refused with 403
`FORBIDDEN`; another organization's record is answered with 404 `NOT_FOUND`,
so its existence is not disclosed.

Prices and the reorder level are decimal **strings**. A number in a request
body is refused with 400 `VALIDATION_ERROR`.

---

### 1. List products
- **Method / Path**: `GET /api/v1/products`
- **Permission**: `products.read`
- **Query Parameters**:
  - `search` (string, optional): matched against the SKU and the name. The
    characters that would otherwise act as wildcards (`%`, `_`, `\`) are
    escaped, so the term is literal text.
  - `categoryId` (uuid, optional): only the products of that category.
  - `status` (`'all' | 'active' | 'archived'`, optional, default `'active'`):
    the archival state to include.
  - `page` (integer, optional, default `1`, min `1`).
  - `pageSize` (integer, optional, default `25`, min `1`, max `100`).
  - `sortBy` (`'name' | 'sku' | 'createdAt'`, optional, default `'name'`).
  - `sortOrder` (`'asc' | 'desc'`, optional, default `'asc'`).
- **Response 200 OK**:
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "organizationId": "uuid",
        "sku": "SKU-1001",
        "name": "Blue T-Shirt",
        "categoryId": "uuid",
        "unitId": "uuid",
        "purchasePrice": "4.5000",
        "sellingPrice": "9.9900",
        "lowStockThreshold": "2.000",
        "isArchived": false,
        "version": 1,
        "createdAt": "2026-11-11T20:00:00.000Z",
        "updatedAt": "2026-11-11T20:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 25
  }
  ```
- **Notes**: The default status is applied by the service when no status is
  asked for; the interface shows which filter is in force. A list used to choose
  a product for a document asks for the active ones only.

---

### 2. Create a product
- **Method / Path**: `POST /api/v1/products`
- **Permission**: `products.write`
- **Request Body**:
  ```json
  {
    "sku": "SKU-1001",
    "name": "Blue T-Shirt",
    "categoryId": "uuid",
    "unitId": "uuid",
    "purchasePrice": "4.5000",
    "sellingPrice": "9.9900",
    "lowStockThreshold": "2.000"
  }
  ```
- **Response 201 Created**: The created product, with `version: 1` and
  `isArchived: false`.
- **Response 400**: A missing or malformed field, a price with more than four
  decimal places, a negative price, or a price sent as a number. Each offending
  field is named.
- **Response 409**: The SKU already exists in the organization. The conflicting
  product is named.
- **Notes**: A duplicate **name** is never refused. The interface asks the
  service for the same-named products and shows a notice that names their SKU.

---

### 3. Get a product
- **Method / Path**: `GET /api/v1/products/:id`
- **Permission**: `products.read`
- **Response 200 OK**: The product.
- **Response 404**: The product does not exist, or belongs to another
  organization.

---

### 4. Update a product
- **Method / Path**: `PUT /api/v1/products/:id`
- **Permission**: `products.write`
- **Request Body**: the same fields as the creation, plus the version the
  caller read:
  ```json
  {
    "version": 1,
    "sku": "SKU-1001",
    "name": "Blue T-Shirt",
    "categoryId": "uuid",
    "unitId": "uuid",
    "purchasePrice": "4.5000",
    "sellingPrice": "10.4900",
    "lowStockThreshold": "2.000"
  }
  ```
- **Response 200 OK**: The updated product, with the version increased.
- **Response 400**: A malformed field, as on creation.
- **Response 404**: The product does not exist, or belongs to another
  organization.
- **Response 409**: The SKU already belongs to another product, or the version
  is stale (`STALE_VERSION`).

---

### 5. Archive a product
- **Method / Path**: `POST /api/v1/products/:id/archive`
- **Permission**: `products.write`
- **Response 200 OK**: The archived product (the full product object), with
  `isArchived: true` and `version` increased.
- **Response 404**: The product does not exist, or belongs to another
  organization.
- **Response 409**: The product is in use (`PRODUCT_IN_USE`) - open documents or
  reserved stock reference it. The product stays active. Archiving a product
  that is already archived is refused with `INVALID_STATE_TRANSITION`.

---

### 6. Restore a product
- **Method / Path**: `POST /api/v1/products/:id/restore`
- **Permission**: `products.write`
- **Response 200 OK**: The restored product (the full product object), with
  `isArchived: false` and `version` increased.
- **Response 404**: The product does not exist, or belongs to another
  organization.
- **Response 409**: The product is not archived (`INVALID_STATE_TRANSITION`).

---

### 7. List product categories
- **Method / Path**: `GET /api/v1/product-categories`
- **Permission**: `products.read`
- **Response 200 OK**: `[{ "id": "uuid", "name": "Apparel" }]`

---

### 8. Create a product category
- **Method / Path**: `POST /api/v1/product-categories`
- **Permission**: `products.write`
- **Request Body**: `{ "name": "Apparel" }`
- **Response 201 Created**: `{ "id": "uuid", "name": "Apparel" }`
- **Response 400**: The name is missing or malformed.
- **Response 409**: The name already exists in the organization, compared without
  regard to capitalisation. The existing category is named.

---

### 9. List units of measure
- **Method / Path**: `GET /api/v1/units-of-measure`
- **Permission**: `products.read`
- **Response 200 OK**: `[{ "id": "uuid", "name": "unit", "abbreviation": "unit" }]`

---

### 10. Create a unit of measure
- **Method / Path**: `POST /api/v1/units-of-measure`
- **Permission**: `products.write`
- **Request Body**: `{ "name": "dozen", "abbreviation": "dz" }`
- **Response 201 Created**: `{ "id": "uuid", "name": "dozen", "abbreviation": "dz" }`
- **Response 400**: The name or the abbreviation is missing or malformed.
- **Response 409**: The name already exists in the organization, compared without
  regard to capitalisation. The existing unit is named.

---

### The organization's currency (read-only)

The identity answer and the current-organization answer carry the currency the
organization's prices are in:

```json
{ "organization": { "id": "uuid", "name": "Acme", "currencyCode": "USD" } }
```

It is read-only in this feature: changing it belongs to the Organization
settings feature, which also owns the rule that the currency locks once an
order or an invoice exists.

---

### Error codes used

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | A field is missing or malformed; each offending field is named |
| `UNAUTHENTICATED` | 401 | No session, or the session has ended |
| `FORBIDDEN` | 403 | The caller does not hold the required permission |
| `NOT_FOUND` | 404 | The record does not exist, or belongs to another organization |
| `DUPLICATE_RECORD` | 409 | The SKU, the category name or the unit name is taken; the existing record is named |
| `STALE_VERSION` | 409 | The record changed since it was read |
| `INVALID_STATE_TRANSITION` | 409 | The product is already archived, or already not archived |
| `PRODUCT_IN_USE` | 409 | Open documents or reserved stock reference the product |
