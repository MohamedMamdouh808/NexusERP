# Contacts API Contracts

All endpoints are rooted at `/api/v1/contacts` and require a valid session cookie and CSRF token on state-changing requests.

---

### 1. List Contacts
- **Method / Path**: `GET /api/v1/contacts`
- **Permission**: `contacts.read`
- **Query Parameters**:
  - `search` (string, optional): search string matched against `code`, `name`, `email`, `phone`. Wildcards (`%`, `_`, `\`) are automatically escaped.
  - `role` (`'all' | 'customer' | 'supplier'`, optional, default `'all'`): filter by contact role.
  - `status` (`'all' | 'active' | 'archived'`, optional, default `'active'`): filter by archival state.
  - `page` (integer, optional, default `1`, min `1`).
  - `pageSize` (integer, optional, default `25`, min `1`, max `100`).
  - `sortBy` (`'name' | 'code' | 'createdAt'`, optional, default `'name'`).
  - `sortOrder` (`'asc' | 'desc'`, optional, default `'asc'`).
- **Response 200 OK**:
  ```json
  {
    "items": [
      {
        "id": "uuid",
        "code": "CUST-00001",
        "name": "Acme Corp",
        "email": "contact@acme.com",
        "phone": "+1 555 0100",
        "isCustomer": true,
        "isSupplier": false,
        "addressLine1": "123 Main St",
        "addressLine2": "Suite 400",
        "city": "Metropolis",
        "region": "NY",
        "postalCode": "10001",
        "country": "USA",
        "isArchived": false,
        "version": 1,
        "createdAt": "2026-11-10T20:00:00.000Z",
        "updatedAt": "2026-11-10T20:00:00.000Z"
      }
    ],
    "total": 1,
    "page": 1,
    "pageSize": 25
  }
  ```

---

### 2. Create Contact
- **Method / Path**: `POST /api/v1/contacts`
- **Permission**: `contacts.write`
- **Request Body**:
  ```json
  {
    "name": "Acme Corp",
    "email": "contact@acme.com",
    "phone": "+1 555 0100",
    "isCustomer": true,
    "isSupplier": false,
    "addressLine1": "123 Main St",
    "addressLine2": "Suite 400",
    "city": "Metropolis",
    "region": "NY",
    "postalCode": "10001",
    "country": "USA"
  }
  ```
- **Response 201 Created**: Returns created contact object with assigned `code`, `id`, `version: 1`, `isArchived: false`.
- **Response 400**: Missing required fields or neither `isCustomer` nor `isSupplier` is true (`VALIDATION_ERROR`).
- **Response 409**: Email already registered in the active organization (`DUPLICATE_RECORD`).

---

### 3. Get Contact by ID
- **Method / Path**: `GET /api/v1/contacts/:id`
- **Permission**: `contacts.read`
- **Response 200 OK**: Returns contact object.
- **Response 404 Not Found**: If contact does not exist or belongs to another organization (`NOT_FOUND`).

---

### 4. Update Contact
- **Method / Path**: `PUT /api/v1/contacts/:id`
- **Permission**: `contacts.write`
- **Request Body**:
  ```json
  {
    "version": 1,
    "name": "Acme Industrial Corp",
    "email": "contact@acme.com",
    "phone": "+1 555 0199",
    "isCustomer": true,
    "isSupplier": true,
    "addressLine1": "123 Main St",
    "addressLine2": "Building B",
    "city": "Metropolis",
    "region": "NY",
    "postalCode": "10001",
    "country": "USA"
  }
  ```
- **Response 200 OK**: Returns updated contact object with incremented `version` (e.g. `2`).
- **Response 404**: Contact not found or cross-tenant (`NOT_FOUND`).
- **Response 409**: Stale update conflict (`STALE_VERSION`) or duplicate email conflict (`DUPLICATE_RECORD`).

---

### 5. Archive Contact
- **Method / Path**: `POST /api/v1/contacts/:id/archive`
- **Permission**: `contacts.write`
- **Response 200 OK**: Returns `{ "id": "uuid", "isArchived": true }`.
- **Response 404**: Contact not found or cross-tenant (`NOT_FOUND`).
- **Response 409**: Contact referenced by active documents (`CONTACT_IN_USE`).

---

### 6. Restore Contact
- **Method / Path**: `POST /api/v1/contacts/:id/restore`
- **Permission**: `contacts.write`
- **Response 200 OK**: Returns `{ "id": "uuid", "isArchived": false }`.
- **Response 404**: Contact not found or cross-tenant (`NOT_FOUND`).
