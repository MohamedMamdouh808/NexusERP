# NexusERP — Product Requirements Document

---

## 1. Project Identity

| Field | Value |
|---|---|
| Project Name | NexusERP |
| Project ID | PRD-001 |
| Version | v1.0 |
| Status | Draft |
| Priority | High |
| Created Date | 2026-10-17 |
| Last Updated | 2026-10-17 |
| Owner | Mohamed (Product Owner / PM) |
| Team Members | Frontend Dev, Backend Dev, Designer, QA, Engineering Lead [TBD], Pilot Business Representative [TBD] |
| Tech Stack | React 18+, TypeScript, Vite, Tailwind CSS, Node.js LTS, NestJS, Prisma, PostgreSQL, Docker, GitHub Actions |
| Repository | [TBD] |
| Git Branch Prefix | NNN-feature-name |
| PRD File Path | docs/PRD.md |

---

## 2. Problem & Purpose

### Problem Statement
Small retail, wholesale, and general trading businesses manage products, inventory, purchasing, sales, and invoices in spreadsheets or disconnected applications. This causes duplicate data entry, inaccurate stock levels, order-processing mistakes, delayed invoicing, and limited visibility into business performance. These businesses have outgrown spreadsheets, but existing ERP systems are too complex, expensive, or difficult to configure for their needs.

### Project Purpose
NexusERP is a modular, multi-tenant ERP SaaS platform. It connects purchasing, inventory, sales, invoicing, and payment tracking through validated workflows so that one business action updates every related record consistently. Each organization operates in an isolated workspace and enables only the modules it needs.

### Business Value
1. **Data accuracy:** Inventory, sales, purchasing, and invoicing records stay consistent through validated workflows and controlled state transitions.
2. **Less manual work:** Customer, supplier, and product records are entered once and reused across modules.
3. **Inventory control:** Stock balances, receipts, reservations, shipments, and adjustments are visible and auditable.
4. **Faster order processing:** Purchasing, sales, delivery, invoicing, and payment recording follow one connected workflow.
5. **Better decisions:** Owners and managers see reliable stock, sales, and outstanding-payment information.
6. **Growth support:** Organizations enable modules as operational needs expand.

### Opportunity
A focused, approachable ERP for small trading businesses fills the gap between spreadsheets and enterprise ERP suites. The v1 architecture (modular monolith, organization-scoped data, explicit module boundaries) is the foundation for adding modules after pilot validation. Business benefits are validated with pilot users and are not assumed.

---

## 3. Goals & Objectives

### Primary Goal
Deliver a functional, secure, multi-tenant ERP MVP in which a small retail, wholesale, or trading business completes the full operational cycle: create product → create purchase order → receive goods → confirm sales order → reserve stock → ship goods → issue invoice → record payment → view updated reports. Stock quantities and financial records remain consistent, organizations remain isolated, and invalid or repeated operations are handled safely. The MVP is validated by at least one pilot business.

### Objectives
1. Deliver the multi-tenant foundation (authentication, organization workspaces, server-side RBAC, contacts, products) with zero cross-tenant access by 2026-11-15.
2. Deliver transaction-safe inventory and purchasing with idempotent postings and audit logging by 2026-12-13.
3. Deliver sales, shipments, invoicing, payment recording, and minimum operational reports by 2027-01-10.
4. Start a pilot beta by 2027-01-18 in which at least one business completes the full core cycle with real data.
5. Clear all release-blocking conditions (Section 14) before public launch, targeted for 2027-02-07.

### Success Definition
The MVP is validated when the criteria in Section 12 are met: the pilot cycle completes, core-workflow completion exceeds 80%, at least 70% of pilot users work unassisted, satisfaction averages at least 4 out of 5, no unexplained stock discrepancies or duplicate postings remain, all tenant-isolation tests pass, and no critical security or data-integrity defect is open. Public launch depends on release-readiness criteria, not on a calendar date.

### Non-Goals
- NexusERP v1 is not a complete accounting system and makes no tax-compliance or e-invoicing-compliance claims.
- NexusERP v1 does not reproduce the full feature set of Odoo or any other ERP.
- NexusERP v1 does not support microservices, third-party integrations, or custom third-party modules.

---

## 4. Scope

### In Scope
- Multi-tenant organization workspaces, user registration, login, logout, and session management.
- Role-based access control with server-side permission checks and administrator-managed user assignment.
- Organization settings and module availability controls.
- Customer and supplier records with contact details and addresses.
- Product catalog with categories, units of measure, SKU, and basic selling and purchasing prices.
- Warehouses, stock balances (on-hand, reserved, available), goods receipts, reservations, shipments, controlled stock adjustments, and an immutable stock-movement history.
- Purchase orders with partial goods receipts.
- Sales orders with confirmation and stock reservation.
- Operational invoicing and full or partial payment recording with allocation to invoices.
- Audit log of important business and administrative actions.
- Minimum operational reporting (stock, movements, outstanding invoices, document statuses, stock reconciliation).
- Responsive web interface for desktop and tablet, REST API with OpenAPI documentation, automated tests, migrations, seed data, Docker development environment, and documented deployment.

### Out of Scope
- Full accounting, general ledger, chart of accounts, financial statements.
- Automated tax calculation, tax filing, jurisdiction-specific tax or e-invoicing compliance.
- Payroll, HR, attendance, and employee management beyond application users and permissions.
- Manufacturing, bills of materials, production planning.
- Advanced CRM pipelines and marketing automation.
- Public e-commerce storefront and online checkout.
- Native iOS and Android applications.
- Third-party integrations (payment gateways, shipping providers, external accounting platforms, marketplaces).
- Multi-currency transactions and currency conversion.
- Multi-company consolidation and intercompany accounting.
- Complex warehouse-transfer, branch, and franchise workflows.
- Public custom-module marketplace and execution of third-party module code.
- Demand forecasting and AI-generated business decisions.
- Complex approval workflows and customizable report builders.
- Enterprise SSO and advanced compliance certifications.

### Assumptions
1. Each organization operates in a single currency, stored as an ISO 4217 code on the organization. No currency conversion exists in v1.
2. Each organization has at least one warehouse; the default warehouse is created at organization creation.
3. Users hold multiple roles when needed; effective permissions are the union of assigned roles.
4. In v1, one shipment fully ships one sales order and one invoice is created per sales order. The data model supports multiple shipments and invoices per order for P1 partial workflows.
5. Pricing excludes tax. Tax fields do not exist in v1.
6. Pilot users are identified before the end of Phase 2.
7. UI language at launch is English. Arabic and right-to-left localization is [TBD] pending pilot feedback.
8. Jurisdiction-specific legal requirements for Egypt or other launch markets are [TBD] and require a separate assessment before any local compliance feature.

### Constraints
1. 16-week delivery plan starting 2026-10-19, staffed by one primary developer or a small part-time team.
2. Modular monolith architecture; no microservices, Kubernetes, or event streaming in v1.
3. PostgreSQL is the system of record for all business state.
4. Server-side enforcement of all business rules, tenant isolation, and permissions.
5. No product claim of tax compliance, certified invoicing, or complete accounting.
6. P1 features are deferred whenever they threaten P0 stability.

### Dependencies
1. A pilot business willing to test the MVP with representative data.
2. PaaS hosting (Railway or Render) with managed PostgreSQL, backups, and encryption at rest.
3. PostHog (or an equivalent privacy-conscious analytics tool) for product analytics.
4. Error-monitoring tool [TBD].
5. Design assets (UI kit, layouts, component styles) ready before Phase 1 frontend work.
6. Stakeholder availability for approval reviews at each gate.
7. Third-party API availability: none required in v1.

---

## 5. Users & Personas

### Primary Users
Owners and operations managers of small retail, wholesale, and general trading businesses.

### Secondary Users
Sales staff, inventory staff, purchasing staff, and organization administrators. One person frequently holds several of these roles in a very small business.

### Persona 1 — Omar (Primary)
| Attribute | Detail |
|---|---|
| Name | Omar |
| Role | Owner / Operations Manager of a small trading business |
| Goal | Run purchasing, stock, sales, invoicing, and payments from one place with accurate stock and invoice records |
| Pain Point | Spreadsheets and disconnected tools cause stock discrepancies, repeated data entry, hard-to-track orders, and unclear unpaid balances |
| Tech Level | Low to Medium |
| Frequency | Daily |
| Success Definition | Completes the full purchase-to-payment cycle in NexusERP and reads current stock and outstanding balances without opening a spreadsheet |

### Persona 2 — Salma
| Attribute | Detail |
|---|---|
| Name | Salma |
| Role | Sales Representative |
| Goal | Process customer orders quickly and accurately |
| Pain Point | Repeated data entry, uncertainty about available stock, unclear order and invoice status |
| Tech Level | Low to Medium |
| Frequency | Daily |
| Success Definition | Creates and confirms a sales order in under 3 minutes with stock availability confirmed by the system |

### Persona 3 — Karim
| Attribute | Detail |
|---|---|
| Name | Karim |
| Role | Inventory Clerk |
| Goal | Maintain accurate stock records and process incoming and outgoing goods |
| Pain Point | Stock discrepancies, unclear movement history, accidental duplicate or incorrect transactions |
| Tech Level | Low |
| Frequency | Daily |
| Success Definition | Every receipt, shipment, and adjustment appears once in the movement history, and balances match the physical count |

### Persona 4 — Nour
| Attribute | Detail |
|---|---|
| Name | Nour |
| Role | Purchasing Officer |
| Goal | Replenish stock and track supplier orders |
| Pain Point | Difficulty tracking outstanding purchase orders, received quantities, and supplier information |
| Tech Level | Low to Medium |
| Frequency | Several times per week |
| Success Definition | Sees ordered, received, and outstanding quantities for every purchase order and receives goods partially without errors |

### Persona 5 — Hana
| Attribute | Detail |
|---|---|
| Name | Hana |
| Role | Organization Administrator |
| Goal | Configure the workspace and ensure employees have appropriate access |
| Pain Point | Unclear responsibilities, excessive permissions, difficulty controlling access to sensitive business records |
| Tech Level | Medium |
| Frequency | Weekly |
| Success Definition | Assigns roles and enables modules so each employee accesses only the records and actions required for their work |

---

## 6. MoSCoW Feature Prioritization

Sprint = two-week sprint. S1 starts 2026-10-19; S2 starts 2026-11-02; S3 starts 2026-11-16; S4 starts 2026-11-30; S5 starts 2026-12-14; S6 starts 2026-12-28; S7 starts 2027-01-11; S8 starts 2027-01-25.

### Must Have — P0

| ID | Feature | Status | Description | Assigned To | Sprint |
|---|---|---|---|---|---|
| P0-F001 | Authentication and Session Management | TODO | Registration, login, logout, secure server-side sessions, CSRF protection, rate limiting | Backend Dev, Frontend Dev | S1 |
| P0-F002 | Organization Workspaces and Tenant Isolation | TODO | Organization creation, memberships, active-organization context, organization settings, module availability controls | Backend Dev, Frontend Dev | S1 |
| P0-F003 | Role-Based Access Control and User Administration | TODO | Roles, permissions, multi-role users, administrator-managed user assignment | Backend Dev, Frontend Dev | S2 |
| P0-F004 | Customer and Supplier Management | TODO | Create, view, update, search, archive customers and suppliers with contact details and addresses | Backend Dev, Frontend Dev | S2 |
| P0-F005 | Product Catalog | TODO | Products with SKU, category, unit of measure, prices; archive instead of delete | Backend Dev, Frontend Dev | S2 |
| P0-F006 | Inventory Balances, Adjustments, and Movement History | TODO | Warehouses, on-hand/reserved/available balances, authorized adjustments with reason, immutable movement history | Backend Dev, Frontend Dev | S3 |
| P0-F007 | Purchase Orders and Goods Receipts | TODO | Purchase orders, status transitions, partial receipts, over-receipt prevention | Backend Dev, Frontend Dev | S4 |
| P0-F008 | Sales Orders and Stock Reservation | TODO | Sales orders, confirmation, all-or-nothing stock reservation, safe cancellation | Backend Dev, Frontend Dev | S5 |
| P0-F009 | Shipments and Stock Deduction | TODO | Shipment posting that deducts stock and consumes reservations transactionally | Backend Dev, Frontend Dev | S5 |
| P0-F010 | Invoicing | TODO | Invoice creation from shipped orders, issuing, balance calculation, immutability, void procedure | Backend Dev, Frontend Dev | S6 |
| P0-F011 | Payment Recording and Allocation | TODO | Full and partial payments allocated to invoices, over-allocation prevention, reversal procedure | Backend Dev, Frontend Dev | S6 |
| P0-F012 | Audit Log | TODO | Append-only record of important business and administrative actions | Backend Dev, Frontend Dev | S2 |
| P0-F013 | Minimum Operational Reporting | TODO | Stock on hand, stock movements, outstanding invoices, document statuses, stock reconciliation | Backend Dev, Frontend Dev | S6 |
| P0-F014 | Reliability and Quality Foundation | TODO | Transactions, idempotency, database constraints, CI pipeline, OpenAPI contract, automated test suites | Backend Dev, QA | S1–S8 |

### Should Have — P1

P1 features are scheduled only after the P0 exit criteria of the preceding phase are met.

| ID | Feature | Status | Description | Assigned To | Sprint |
|---|---|---|---|---|---|
| P1-F001 | Dashboard and Enhanced Reports | TODO | Key metrics dashboard, sales and purchase totals by date range, low-stock alerts, outstanding invoice summaries | Backend Dev, Frontend Dev | S7 (conditional) |
| P1-F002 | Consistent List Filtering | TODO | Cross-module search, status filters, date-range filters, sorting, saved default sorting | Frontend Dev, Backend Dev | S7 (conditional) |
| P1-F003 | User Invitations | TODO | Email invitations with expiry and acceptance handling | Backend Dev, Frontend Dev | S7 (conditional) |
| P1-F004 | Partial Shipments, Partial Invoicing, and Backorders | TODO | Multiple shipments and invoices per sales order, remaining-quantity tracking | Backend Dev, Frontend Dev | S7 (conditional) |
| P1-F005 | CSV Import and Export | TODO | Import preview, row validation, duplicate detection for products and contacts; CSV export of reports | Backend Dev, Frontend Dev | S8 (conditional) |
| P1-F006 | Usability Improvements | TODO | Keyboard-friendly forms and tables, confirmation dialogs, reusable filters, consistent feedback | Frontend Dev, Designer | S8 (conditional) |

### Could Have — P2

| ID | Feature | Status | Description | Assigned To | Sprint |
|---|---|---|---|---|---|
| P2-F001 | Dark Mode | TODO | Alternate color theme for the web interface | Frontend Dev | Post-v1 |
| P2-F002 | Keyboard Shortcuts | TODO | Global shortcuts for navigation and common actions | Frontend Dev | Post-v1 |
| P2-F003 | Bulk Actions | TODO | Multi-select actions on list views (archive, export) | Frontend Dev, Backend Dev | Post-v1 |

### Won't Have — P3

| ID | Feature | Status | Description | Assigned To | Sprint |
|---|---|---|---|---|---|
| P3-F001 | Full Accounting | TODO | General ledger, chart of accounts, financial statements | [TBD] | Post-v1 |
| P3-F002 | Tax and E-Invoicing Compliance | TODO | Tax filing, automated tax calculation, jurisdiction-specific e-invoicing | [TBD] | Post-v1 |
| P3-F003 | Payroll and HR Suites | TODO | Payroll, attendance, employee management | [TBD] | Post-v1 |
| P3-F004 | Manufacturing | TODO | Bills of materials, production planning | [TBD] | Post-v1 |
| P3-F005 | E-Commerce Storefront | TODO | Public storefront and online checkout | [TBD] | Post-v1 |
| P3-F006 | Native Mobile Apps | TODO | iOS and Android applications | [TBD] | Post-v1 |
| P3-F007 | Third-Party Integrations | TODO | Payment gateways, shipping providers, external accounting platforms | [TBD] | Post-v1 |
| P3-F008 | Multi-Currency | TODO | Multi-currency transactions and conversion | [TBD] | Post-v1 |
| P3-F009 | Intercompany Accounting and Consolidation | TODO | Multi-company consolidation | [TBD] | Post-v1 |
| P3-F010 | Advanced CRM and Marketing Automation | TODO | Pipelines, lead scoring, campaigns | [TBD] | Post-v1 |
| P3-F011 | Module Marketplace | TODO | Public marketplace and third-party module execution | [TBD] | Post-v1 |
| P3-F012 | AI Decisions and Forecasting | TODO | AI-generated business decisions, demand forecasting | [TBD] | Post-v1 |
| P3-F013 | Complex Approvals and Report Builder | TODO | Multi-step approval workflows, customizable report builders | [TBD] | Post-v1 |
| P3-F014 | Enterprise SSO and Certifications | TODO | SSO, SOC 2, ISO 27001 and similar | [TBD] | Post-v1 |

---

## 7. Functional Requirements

### 7.0 Global Conventions

- **Document numbering:** Each organization has independent sequences with prefixes PO-, GR-, SO-, SH-, INV-, PAY- followed by a six-digit number (for example `SO-000042`). Numbers are assigned inside the creating transaction and are unique per organization.
- **Status transitions:** The server enforces every transition. An invalid transition returns HTTP 409 with code `INVALID_STATE_TRANSITION`.
- **Error format:** `{ "code", "message", "details": [], "requestId" }`. HTTP codes: 400 validation (`VALIDATION_ERROR`), 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 422 idempotency-key mismatch, 429 rate limited.
- **Cross-tenant access:** A request for a record owned by another organization returns 404.
- **Pagination:** All list endpoints paginate on the server. Default page size 25, maximum 100.
- **Numeric precision:** Quantities `NUMERIC(14,3)`, unit prices and costs `NUMERIC(14,4)`, line and document totals `NUMERIC(14,2)`. Line total = quantity × unit price, rounded half-up to 2 decimals. Document total = sum of line totals. JSON transports decimals as strings.
- **Idempotency:** Posting endpoints require an `Idempotency-Key` header (Section 9.6).
- **Audit:** Every audited action writes its audit record in the same database transaction as the business change.

### 7.1 User Flow — Core Business Cycle

Primary actor: Omar (Owner), with Karim, Salma, and Nour performing role-specific steps. In a very small business, Omar performs every step.

1. Omar opens the NexusERP login page and submits email and password. The system verifies credentials, creates a session, and opens the Home page of his active organization.
2. Omar opens Products, selects "New Product", enters name, SKU, category, unit of measure, purchase price, and selling price, and saves. The system validates SKU uniqueness, shows a success message, and lists the product.
3. Omar opens Contacts and creates a supplier and a customer. The system rejects a duplicate email and shows the field error inline.
4. Nour opens Purchase Orders, selects "New Purchase Order", chooses the supplier, adds product lines with quantity and unit cost, saves as Draft, and selects "Confirm". The system moves the order to Confirmed.
5. Goods arrive. Karim opens the Confirmed purchase order and selects "Receive Goods". He enters received quantities (partial or full). The system validates each quantity against the outstanding quantity, posts the receipt, increases on-hand stock, writes RECEIPT movements, and updates the order to Partially Received or Received.
6. Karim opens Inventory and verifies on-hand, reserved, and available quantities for the received product.
7. Salma opens Sales Orders, selects "New Sales Order", chooses the customer and warehouse, adds product lines, and sees line totals and the order total. She saves the Draft and selects "Confirm".
8. The system checks availability for every line. When all lines are available, the system reserves the stock, moves the order to Confirmed, and shows the updated available quantities. When any line is short, the system confirms nothing and lists the short lines.
9. Karim opens the Confirmed sales order and selects "Ship". The system posts the shipment, deducts on-hand stock, consumes the reservations, writes SHIPMENT movements, and moves the order to Shipped.
10. Omar opens the Shipped order and selects "Create Invoice". The system creates a Draft invoice from the shipment lines and prices. Omar reviews it and selects "Issue". The system assigns the invoice number, sets the due date, and makes the invoice immutable with status Issued.
11. The customer pays. Omar opens Payments, selects "Record Payment", chooses the customer, enters amount, date, and method, and allocates the amount to the issued invoice. The system validates the allocation against the invoice balance, saves the payment, and updates the invoice to Partially Paid or Paid.
12. Omar opens Reports and views Outstanding Invoices and Stock On Hand. Both reflect the cycle just completed.
13. Hana opens Audit Log and finds each action from steps 4–11 with user, time, and affected record.

### 7.2 Edge Cases

Format: Condition → System behavior → User feedback.

| Category | Condition | System Behavior | User Feedback |
|---|---|---|---|
| Validation | Required field missing or malformed (empty product name, negative quantity, invalid email) | Request rejected with 400 `VALIDATION_ERROR` listing each field; no data saved | Inline error under each invalid field; form keeps entered values |
| Validation | Receipt quantity exceeds outstanding purchase quantity | Receipt rejected; no stock change | "Received quantity exceeds the outstanding quantity of X for this line." |
| Validation | Payment allocation exceeds invoice balance, or allocations do not sum to the payment amount | Payment rejected; no records created | "Allocated amount exceeds the invoice balance of X." or "Allocations must equal the payment amount." |
| Validation | Stock adjustment would make on-hand negative or below reserved quantity | Adjustment rejected | "Adjustment would reduce stock below the reserved quantity of X." |
| Empty state | Organization has no products, contacts, orders, or invoices | List returns an empty page; no error | Empty-state panel explaining the list and a primary "Create" action |
| Empty state | Report filters match no records | Report returns zero rows | "No records match the selected filters." with a "Clear filters" action |
| System failure | Network drops during a form submit | Client keeps the form data and retries with the same Idempotency-Key | "Connection lost. Retry" button; no duplicate posting after retry |
| System failure | Database error occurs mid-transaction (confirm, ship, receive, pay) | Entire transaction rolls back; no partial records; error logged with `requestId` | "The operation could not be completed. No changes were saved. Reference: requestId." |
| System failure | Server returns 5xx on page load | Error boundary renders; error logged | "Something went wrong" with Retry action and reference ID |
| Permission | User lacks the permission for an action | 403 `FORBIDDEN`; denial logged | Action hidden in the interface; direct attempts show "You do not have permission to perform this action." |
| Permission | Session expired or invalid | 401; session cleared | Redirect to login with "Your session has expired. Please sign in again." |
| Permission | User requests a record of another organization by ID | 404 returned; attempt logged | "Record not found." |
| Conflict | Two users confirm sales orders competing for the last units of stock | One transaction reserves the stock; the other fails with 409 `INSUFFICIENT_STOCK` | "Not enough available stock for: product (available X, required Y)." |
| Conflict | Duplicate SKU, contact email, or user email within the organization | 409 `DUPLICATE_RECORD` | "A product with this SKU already exists." (field-level) |
| Conflict | Same Idempotency-Key resent with identical request | Original response returned; no new posting | Same success result as the original request |
| Conflict | Same Idempotency-Key reused with a different request body | 422 `IDEMPOTENCY_KEY_REUSED` | "This request conflicts with an earlier request. Refresh and try again." |
| Conflict | User edits a document another user already changed or posted | 409 `INVALID_STATE_TRANSITION` or `STALE_VERSION` (version check) | "This record changed since you opened it. Reload to continue." |
| Conflict | Archiving a product referenced by open documents or reserved stock | 409 `PRODUCT_IN_USE` | "This product is used by open documents or has reserved stock." |

### 7.3 UX Rules (Applied to Every Feature)

1. **Validation:** Forms validate on blur and on submit using the same Zod schema as the API contract. Errors display inline under the field. The server validation response is always authoritative and maps to the same field errors.
2. **Loading state:** Every data fetch shows a skeleton placeholder. Every submit button shows a spinner and is disabled while the request is in flight.
3. **Error state:** Field errors are inline; operation errors appear in a dismissible banner with the reference `requestId`; page-level failures show an error panel with a Retry action.
4. **Success feedback:** Every successful create, update, post, or state transition shows a confirmation toast naming the record (for example "Sales order SO-000042 confirmed") and updates the visible status immediately.
5. **Destructive and irreversible actions** (cancel, void, post shipment, issue invoice, reverse payment) require a confirmation dialog stating the consequence.
6. **Empty states** explain what the list contains and offer the primary create action.
7. **Status display:** Every document shows a status badge using the same status names as the API.
8. **Tables:** Server-side pagination, sortable columns, and a visible total count on every list.

### 7.4 Feature Requirements — Must Have (P0)

#### P0-F001 — Authentication and Session Management
- **Description:** Users register an account and a first organization, sign in with email and password, and sign out. Sessions are server-side with HttpOnly cookies.
- **User Story:** As Omar, I want to sign in securely so that only authorized people access my business data.
- **Trigger:** User submits the registration or login form.
- **Pre-conditions:** For login, an active account exists. For registration, the email is unused.
- **Post-conditions:** A session exists with an HttpOnly, Secure, SameSite cookie. The active organization is set. Failed attempts are counted.
- **Main Flow:**
  1. The client sends `POST /api/v1/auth/login` with email and password.
  2. The server validates the payload schema.
  3. The server applies rate limits per IP and per email.
  4. The server verifies the password against the Argon2id hash.
  5. The server loads active memberships and selects the last-used organization.
  6. The server creates the session record, sets the session cookie, and returns the CSRF token.
  7. The client navigates to Home.
- **Alternate Flows:**
  - A1: Invalid credentials return a generic 401 "Email or password is incorrect" without revealing which was wrong.
  - A2: Rate limit exceeded returns 429 with `Retry-After`.
  - A3: User with no active membership receives 403 `NO_ACTIVE_ORGANIZATION`.
  - A4: Registration (`POST /api/v1/auth/register`) creates the user, organization, Administrator membership, default roles, default warehouse, and document sequences in one transaction.
  - A5: Administrator-created accounts require a password change at first login.
- **Acceptance Criteria:**
  - [ ] Passwords are stored only as Argon2id hashes; no plaintext or reversible form exists.
  - [ ] The session cookie carries HttpOnly, Secure, and SameSite attributes.
  - [ ] State-changing requests without a valid CSRF token are rejected with 403.
  - [ ] More than 5 failed logins per email within 15 minutes returns 429.
  - [ ] Login errors never reveal whether the email exists.
  - [ ] Logout invalidates the session server-side; the old cookie is rejected afterward.
  - [ ] Registration is atomic: any failure creates no user and no organization.

#### P0-F002 — Organization Workspaces and Tenant Isolation
- **Description:** Every record belongs to one organization. Users act inside an explicitly selected organization. Administrators configure organization settings and enable or disable modules.
- **User Story:** As Hana, I want my organization's data isolated and configurable so that only my team sees our records and uses the modules we need.
- **Trigger:** User switches organization, opens Settings, or toggles a module.
- **Pre-conditions:** User has an active membership in the target organization.
- **Post-conditions:** The session's active organization is updated; settings and module flags are saved and audited.
- **Main Flow:**
  1. The user selects an organization in the switcher.
  2. The client sends `POST /api/v1/auth/switch-organization` with the organization ID.
  3. The server verifies an active membership for that user and organization.
  4. The server updates the session's active organization.
  5. All subsequent requests resolve tenant scope from the session, never from client-supplied IDs.
  6. The administrator opens Settings and updates name, currency code, and default payment terms.
  7. The administrator toggles a module; the server saves the flag and writes an audit record.
- **Alternate Flows:**
  - A1: Switching to an organization without membership returns 403.
  - A2: Disabling a module that has non-terminal documents (Draft or Confirmed) returns 409 `MODULE_IN_USE`.
  - A3: Disabling a module required by another enabled module (Sales requires Inventory; Invoicing requires Sales) returns 409 `MODULE_DEPENDENCY`.
  - A4: Calls to endpoints of a disabled module return 403 `MODULE_DISABLED`.
- **Acceptance Criteria:**
  - [ ] Every organization-owned table includes `organization_id` with a NOT NULL constraint.
  - [ ] Cross-organization foreign keys are impossible (composite foreign keys include `organization_id`).
  - [ ] Requests for a known record ID of another organization return 404 on every API endpoint.
  - [ ] Automated tests prove tenant isolation for every endpoint, report, and export.
  - [ ] Organization switching revalidates membership and permissions.
  - [ ] Module enable and disable events are audited.

#### P0-F003 — Role-Based Access Control and User Administration
- **Description:** Permissions are grouped into roles. Administrators create users, assign multiple roles, and deactivate memberships. Every protected endpoint checks permissions on the server.
- **User Story:** As Hana, I want to assign roles to employees so that each person accesses only the actions their job requires.
- **Trigger:** Administrator opens Users or Roles.
- **Pre-conditions:** Actor holds `users.manage` or `roles.manage`.
- **Post-conditions:** Membership and role assignments are saved and audited; affected sessions apply new permissions on the next request.
- **Main Flow:**
  1. The administrator opens Users and selects "Add User".
  2. The administrator enters name, email, initial password, and selects one or more roles.
  3. The client sends `POST /api/v1/memberships`.
  4. The server validates input, creates the user (or links an existing account) and the membership, and flags a required password change.
  5. The server writes an audit record `membership.created`.
  6. The administrator later changes roles via `PUT /api/v1/memberships/:id/roles`; the server replaces the assignment and audits `membership.roles_changed`.
- **Alternate Flows:**
  - A1: Removing or demoting the last Administrator returns 409 `LAST_ADMINISTRATOR`.
  - A2: Duplicate email within the organization returns 409 `DUPLICATE_RECORD`.
  - A3: A non-administrator calling these endpoints receives 403.
  - A4: Deactivating a membership invalidates that user's sessions for the organization.
- **Acceptance Criteria:**
  - [ ] Default roles exist: Administrator, Manager, Sales, Inventory, Purchasing.
  - [ ] A user with several roles receives the union of the role permissions.
  - [ ] Every endpoint declares a required permission; an endpoint without one fails the test suite.
  - [ ] Hidden UI actions are also rejected by the API when called directly.
  - [ ] Permission and role changes are audited with before and after values.
  - [ ] The default is deny: a missing permission always returns 403.

#### P0-F004 — Customer and Supplier Management
- **Description:** Organizations maintain customer and supplier records with contact details and addresses. One record can be both customer and supplier.
- **User Story:** As Salma, I want to create and find customers quickly so that I can start a sales order without re-entering their details.
- **Trigger:** User opens Contacts and selects "New Contact" or edits an existing contact.
- **Pre-conditions:** Actor holds `contacts.write` (create, update, archive) or `contacts.read` (view).
- **Post-conditions:** The contact is saved, searchable, and available in purchasing, sales, and invoicing.
- **Main Flow:**
  1. The user opens the contact form and enters name, type flags (customer, supplier), email, phone, and address.
  2. The client validates required fields and formats.
  3. The client sends `POST /api/v1/contacts`.
  4. The server validates the payload and checks email uniqueness within the organization.
  5. The server saves the contact and returns it.
  6. The client shows a success toast and the contact detail page.
- **Alternate Flows:**
  - A1: Duplicate email returns 409 `DUPLICATE_RECORD` with the existing contact's name.
  - A2: Archiving a contact with open documents (Draft or Confirmed orders, unpaid invoices) returns 409 `CONTACT_IN_USE`.
  - A3: Archived contacts are hidden from selectors, remain on historical documents, and are restorable by users with `contacts.write`.
- **Acceptance Criteria:**
  - [ ] Name and at least one type flag are required.
  - [ ] Email is unique per organization, case-insensitive, when provided.
  - [ ] Search matches name, email, and phone.
  - [ ] Contacts are never hard-deleted.
  - [ ] Archived contacts cannot be selected on new documents.
  - [ ] Lists paginate on the server.

#### P0-F005 — Product Catalog
- **Description:** Organizations maintain products with SKU, category, unit of measure, and prices. Products referenced by transactions are archived, never deleted.
- **User Story:** As Omar, I want a single product catalog so that purchasing, stock, sales, and invoices use the same product data.
- **Trigger:** User opens Products and selects "New Product" or edits one.
- **Pre-conditions:** Actor holds `products.write`.
- **Post-conditions:** The product is saved and selectable in documents.
- **Main Flow:**
  1. The user enters name, SKU, category, unit of measure, purchase price, selling price, and an optional low-stock threshold.
  2. The client validates the form.
  3. The client sends `POST /api/v1/products`.
  4. The server validates the payload and SKU uniqueness (case-insensitive within the organization).
  5. The server saves the product and creates zero-quantity stock balance rows on first movement.
  6. The client shows a confirmation toast.
- **Alternate Flows:**
  - A1: Duplicate SKU returns 409 with a field-level error.
  - A2: Negative prices return 400.
  - A3: Archiving a product with reserved stock or Draft/Confirmed documents returns 409 `PRODUCT_IN_USE`.
  - A4: Changing a product's price never alters existing documents (prices are copied to document lines).
- **Acceptance Criteria:**
  - [ ] SKU is unique per organization, case-insensitive.
  - [ ] Prices are non-negative decimals with the documented precision.
  - [ ] A product referenced by any historical transaction cannot be deleted; it is archived.
  - [ ] Archived products do not appear in selectors for new documents.
  - [ ] Categories and units of measure are managed per organization.

#### P0-F006 — Inventory Balances, Adjustments, and Movement History
- **Description:** Organizations manage warehouses and see on-hand, reserved, and available quantities per product and warehouse. Authorized users post adjustments with a reason. Every stock change creates an immutable movement record.
- **User Story:** As Karim, I want an accurate stock balance and movement history so that I can explain every change in quantity.
- **Trigger:** User opens Inventory or selects "New Adjustment".
- **Pre-conditions:** Actor holds `inventory.read` or `inventory.adjust`. At least one warehouse exists.
- **Post-conditions:** A movement of type ADJUSTMENT exists; the balance changes by the signed quantity; an audit record exists.
- **Main Flow:**
  1. Karim opens New Adjustment and selects warehouse, product, signed quantity, reason code (DAMAGE, LOSS, FOUND, COUNT_CORRECTION, OTHER), and a note (required for OTHER).
  2. The client sends `POST /api/v1/inventory/adjustments` with an Idempotency-Key.
  3. The server opens a transaction and locks the stock balance row.
  4. The server verifies the resulting on-hand quantity is not below the reserved quantity and not negative.
  5. The server inserts the movement, updates the balance, writes the audit record, and commits.
  6. The client shows the updated balance.
- **Alternate Flows:**
  - A1: A result below the reserved quantity returns 409 `INSUFFICIENT_STOCK`.
  - A2: A missing reason returns 400.
  - A3: A repeated Idempotency-Key returns the original result without a second movement.
  - A4: Users without `inventory.adjust` receive 403.
  - A5: Warehouse management (`POST/PUT /api/v1/warehouses`) requires `inventory.write`; a warehouse with non-zero stock cannot be deactivated.
- **Acceptance Criteria:**
  - [ ] Available quantity = on-hand − reserved, and is displayed separately from both.
  - [ ] Database CHECK constraints enforce on_hand ≥ 0, reserved ≥ 0, and reserved ≤ on_hand.
  - [ ] Movements cannot be updated or deleted (enforced at the database level).
  - [ ] For every product and warehouse, on-hand equals the sum of movement quantities.
  - [ ] Concurrent adjustments on the same balance serialize and produce a correct result.
  - [ ] A posted adjustment is corrected only by a compensating adjustment with a reason.

#### P0-F007 — Purchase Orders and Goods Receipts
- **Description:** Users create purchase orders for suppliers, confirm them, and receive goods in full or in part. Receipts increase stock.
- **User Story:** As Nour, I want to track ordered, received, and outstanding quantities so that I know what is still due from each supplier.
- **Trigger:** User creates a purchase order, or selects "Receive Goods" on a confirmed order.
- **Pre-conditions:** Supplier and products exist and are active. Actor holds `purchasing.write` or `inventory.receive`.
- **Post-conditions:** On receipt, stock increases, RECEIPT movements exist, and order status and received quantities update.
- **Main Flow:**
  1. Nour creates a purchase order: supplier, destination warehouse, lines (product, quantity, unit cost). The server saves it as DRAFT.
  2. Nour selects Confirm; the server validates at least one line and moves the order to CONFIRMED.
  3. Karim selects Receive Goods and enters received quantity per line.
  4. The client sends `POST /api/v1/purchase-orders/:id/receipts` with an Idempotency-Key.
  5. The server locks the order and balance rows, verifies each received quantity ≤ ordered − already received, and verifies the order is CONFIRMED or PARTIALLY_RECEIVED.
  6. The server creates the goods receipt, inserts RECEIPT movements, increases on-hand quantities, updates line received quantities and the order status, writes the audit record, and commits.
- **Alternate Flows:**
  - A1: Quantity above the outstanding amount returns 400 `OVER_RECEIPT`.
  - A2: Receiving against a DRAFT or CANCELLED order returns 409.
  - A3: Cancelling a DRAFT or CONFIRMED order with no receipts moves it to CANCELLED; cancelling an order with receipts returns 409.
  - A4: Editing is allowed only in DRAFT; changes to a CONFIRMED order require cancel and recreate.
  - A5: A repeated Idempotency-Key returns the original receipt.
- **Acceptance Criteria:**
  - [ ] Status transitions: DRAFT → CONFIRMED → PARTIALLY_RECEIVED → RECEIVED; DRAFT or CONFIRMED → CANCELLED.
  - [ ] Received quantity never exceeds ordered quantity on any line.
  - [ ] Each receipt is immutable and listed in the order's receipt history.
  - [ ] A failed receipt leaves no movement, no balance change, and no status change.
  - [ ] Total and line amounts follow the documented rounding rules.

#### P0-F008 — Sales Orders and Stock Reservation
- **Description:** Users create sales orders for customers. Confirmation reserves stock for every line or for none.
- **User Story:** As Salma, I want order confirmation to guarantee stock so that I never promise goods that are unavailable.
- **Trigger:** User creates a sales order or selects Confirm.
- **Pre-conditions:** Customer and products exist and are active. Actor holds `sales.write`. Inventory and Sales modules are enabled.
- **Post-conditions:** On confirmation, reservations exist, reserved quantities increase, and the order is CONFIRMED.
- **Main Flow:**
  1. Salma creates a sales order: customer, warehouse, lines (product, quantity, unit price defaulting to the product's selling price).
  2. The system calculates line totals and the order total using the documented precision and rounding.
  3. Salma saves the DRAFT and selects Confirm.
  4. The client sends `POST /api/v1/sales-orders/:id/confirm` with an Idempotency-Key.
  5. The server opens a transaction, locks the order and the stock balance rows in ascending product ID order, and verifies available ≥ required for every line using a conditional update.
  6. The server creates reservation records, increases reserved quantities, sets the order to CONFIRMED, writes the audit record, and commits.
- **Alternate Flows:**
  - A1: Any line short of stock returns 409 `INSUFFICIENT_STOCK` listing each short product with available and required quantities; nothing is reserved.
  - A2: Confirming an order that is not DRAFT returns 409; repeated requests with the same key return the original result.
  - A3: Cancelling a CONFIRMED order (before shipment) releases all reservations and moves it to CANCELLED.
  - A4: Cancelling a SHIPPED order returns 409; corrections follow the invoice void and stock adjustment procedures.
  - A5: Editing is allowed only in DRAFT.
- **Acceptance Criteria:**
  - [ ] Two concurrent confirmations never reserve more than the available stock.
  - [ ] Confirmation is all-or-nothing across lines.
  - [ ] Reserved quantity equals the sum of active reservations for each balance.
  - [ ] Status transitions: DRAFT → CONFIRMED → SHIPPED; DRAFT or CONFIRMED → CANCELLED.
  - [ ] Order totals equal the sum of line totals under the documented rounding rule.
  - [ ] Confirming the same order twice never creates duplicate reservations.

#### P0-F009 — Shipments and Stock Deduction
- **Description:** Users ship a confirmed sales order. Posting the shipment deducts on-hand stock and consumes the reservations in one transaction. In v1, one shipment ships the full order.
- **User Story:** As Karim, I want shipping to deduct stock automatically so that balances stay correct without manual edits.
- **Trigger:** User selects Ship on a confirmed sales order.
- **Pre-conditions:** The order is CONFIRMED with active reservations. Actor holds `inventory.ship`.
- **Post-conditions:** A shipment exists; SHIPMENT movements exist; on-hand and reserved quantities decrease; the order is SHIPPED.
- **Main Flow:**
  1. Karim opens the CONFIRMED order and selects Ship, then confirms the dialog.
  2. The client sends `POST /api/v1/sales-orders/:id/shipments` with an Idempotency-Key.
  3. The server locks the order and balance rows.
  4. The server verifies the order is CONFIRMED and has active reservations for every line.
  5. The server creates the shipment and its lines, inserts SHIPMENT movements, decreases on-hand and reserved quantities, marks the reservations consumed, sets the order to SHIPPED, writes the audit record, and commits.
- **Alternate Flows:**
  - A1: Shipping a DRAFT, CANCELLED, or already SHIPPED order returns 409.
  - A2: A repeated Idempotency-Key returns the original shipment without a second deduction.
  - A3: A database failure rolls back the shipment, movements, and balance changes.
  - A4: A shipment cannot be edited or deleted after posting.
- **Acceptance Criteria:**
  - [ ] Shipping deducts exactly the reserved quantities.
  - [ ] On-hand never becomes negative.
  - [ ] Posting the same shipment twice creates one shipment and one set of movements.
  - [ ] Shipment, movements, balances, order status, and audit record commit together or not at all.
  - [ ] The order detail page lists the shipment with its movements.

#### P0-F010 — Invoicing
- **Description:** Users create an invoice from the shipped order, review it, and issue it. Issued invoices are immutable. Invoice balances derive from payment allocations. Invoicing policy: invoice-on-shipment.
- **User Story:** As Omar, I want an invoice created from what was shipped so that customers are billed accurately and I always know what remains unpaid.
- **Trigger:** User selects Create Invoice on a SHIPPED sales order, then selects Issue.
- **Pre-conditions:** The order is SHIPPED and has no non-void invoice. Actor holds `invoices.write` (create) or `invoices.issue` (issue).
- **Post-conditions:** An invoice exists in DRAFT, then ISSUED with number, issue date, and due date.
- **Main Flow:**
  1. Omar selects Create Invoice; the client sends `POST /api/v1/sales-orders/:id/invoices`.
  2. The server copies customer, shipped lines, quantities, and unit prices into a DRAFT invoice and calculates totals.
  3. Omar reviews the invoice and may change the due date.
  4. Omar selects Issue; the client sends `POST /api/v1/invoices/:id/issue` with an Idempotency-Key.
  5. The server verifies status is DRAFT, assigns the number from the organization's sequence, sets issue date and due date (default: issue date plus the organization's default payment terms), sets status ISSUED, writes the audit record, and commits.
- **Alternate Flows:**
  - A1: Creating an invoice for an order that already has a non-void invoice returns 409.
  - A2: Editing or deleting an ISSUED invoice returns 409.
  - A3: Voiding (`POST /api/v1/invoices/:id/void`) requires `invoices.void`, a written reason, and no active payment allocations; the invoice becomes VOID, remains in history, and the order may receive a replacement invoice.
  - A4: Voiding an invoice with allocations returns 409 `INVOICE_HAS_PAYMENTS`; the payments must be reversed first.
  - A5: A repeated Idempotency-Key on issue returns the original result.
- **Acceptance Criteria:**
  - [ ] Invoice statuses: DRAFT, ISSUED, PARTIALLY_PAID, PAID, VOID.
  - [ ] Line total = quantity × unit price rounded half-up to 2 decimals; total = sum of line totals.
  - [ ] Balance = total − sum of active allocations.
  - [ ] Invoice numbers are unique and gap-free within normal operation per organization.
  - [ ] An ISSUED invoice's lines, totals, customer, and numbers cannot change.
  - [ ] Invoices are labeled "Operational invoice — not a tax invoice" in the interface and on printable output.

#### P0-F011 — Payment Recording and Allocation
- **Description:** Users record customer payments and allocate them to issued invoices, supporting partial and full payment. Allocations must equal the payment amount.
- **User Story:** As Omar, I want to record a payment against specific invoices so that I always know each invoice's remaining balance.
- **Trigger:** User opens Payments and selects "Record Payment".
- **Pre-conditions:** Customer has at least one ISSUED or PARTIALLY_PAID invoice. Actor holds `payments.record`.
- **Post-conditions:** A payment and allocations exist; invoice balances and statuses update.
- **Main Flow:**
  1. Omar selects the customer; the system lists the customer's open invoices with balances.
  2. Omar enters amount, date, method (CASH, BANK_TRANSFER, CARD, OTHER), and optional reference, and allocates amounts to invoices.
  3. The client sends `POST /api/v1/payments` with an Idempotency-Key.
  4. The server locks the target invoices, verifies each belongs to the same customer and organization, each allocation ≤ invoice balance, and the sum of allocations equals the payment amount.
  5. The server creates the payment and allocations, updates invoice statuses (PARTIALLY_PAID or PAID), writes the audit record, and commits.
- **Alternate Flows:**
  - A1: Allocation above an invoice balance returns 400 `OVER_ALLOCATION`.
  - A2: Allocations not summing to the amount return 400.
  - A3: Allocating to a DRAFT, VOID, or PAID invoice returns 409.
  - A4: Reversal (`POST /api/v1/payments/:id/reverse`) requires `payments.reverse` and a reason; it creates a reversal record, restores invoice balances and statuses, and leaves the original payment unchanged.
  - A5: A repeated Idempotency-Key returns the original payment.
- **Acceptance Criteria:**
  - [ ] Payments and allocations are immutable after creation.
  - [ ] Concurrent payments against one invoice cannot over-allocate it.
  - [ ] An invoice moves to PAID only when its balance is exactly zero.
  - [ ] Overpayment is rejected; no unallocated credit exists in v1.
  - [ ] A reversal restores the exact prior balance and status.
  - [ ] Duplicate submissions create one payment.

#### P0-F012 — Audit Log
- **Description:** The system records important business and administrative actions in an append-only audit log visible to authorized users.
- **User Story:** As Hana, I want to see who did what and when so that I can investigate discrepancies.
- **Trigger:** An audited action completes, or an authorized user opens the Audit Log.
- **Pre-conditions:** Viewing requires `audit.read`.
- **Post-conditions:** Each audited action has exactly one audit record committed with the action.
- **Main Flow:**
  1. A service performs an audited action inside a transaction.
  2. The service inserts an audit record: organization, acting user, action code, record type and ID, timestamp, and change details.
  3. The transaction commits both the business change and the audit record.
  4. An authorized user opens `GET /api/v1/audit-logs` and filters by date, user, action, or record.
- **Alternate Flows:**
  - A1: If the audit insert fails, the entire business transaction rolls back.
  - A2: Users without `audit.read` receive 403.
  - A3: No endpoint or database role permits update or delete of audit records.
- **Acceptance Criteria:**
  - [ ] Audited actions include: stock adjustment, goods receipt, shipment, order confirmation and cancellation, invoice issue and void, payment record and reversal, role and permission change, membership change, module toggle, and organization settings change.
  - [ ] Each record contains organization, user, action, record reference, timestamp, and relevant before/after values.
  - [ ] Audit records are not modifiable or deletable by application users.
  - [ ] Audit queries return only the active organization's records.
  - [ ] Passwords, session tokens, and secrets never appear in audit details.

#### P0-F013 — Minimum Operational Reporting
- **Description:** Authorized users view stock on hand, stock movements, outstanding invoices, document statuses, and a stock reconciliation check.
- **User Story:** As Omar, I want current stock and unpaid-invoice reports so that I can run the business without spreadsheets.
- **Trigger:** User opens Reports.
- **Pre-conditions:** Actor holds `reports.read`.
- **Post-conditions:** Reports display persisted, organization-scoped data.
- **Main Flow:**
  1. The user opens a report and applies filters.
  2. The client calls the report endpoint (Section 9.5).
  3. The server resolves the organization, verifies permission, and queries persisted data with pagination.
  4. The client renders the table with a loading skeleton, then results or the empty state.
- **Alternate Flows:**
  - A1: Filters matching no rows show the empty state.
  - A2: Invalid date ranges (end before start) return 400.
  - A3: Reports over the row limit require narrowing the date range.
- **Acceptance Criteria:**
  - [ ] Stock on Hand shows on-hand, reserved, and available per product and warehouse.
  - [ ] Stock Movements lists movements for a product or warehouse with type, quantity, source document, user, and time.
  - [ ] Outstanding Invoices lists issued, unpaid invoices with customer, number, due date, total, paid amount, balance, and days overdue.
  - [ ] Document Statuses shows counts of purchase orders, sales orders, shipments, and invoices per status.
  - [ ] Stock Reconciliation reports any product and warehouse where on-hand differs from the sum of movements or reserved differs from the sum of active reservations; the expected result is zero rows.
  - [ ] Every report returns only the active organization's data.

#### P0-F014 — Reliability and Quality Foundation
- **Description:** Cross-cutting engineering controls that guarantee correctness: transactions, idempotency, database constraints, migrations, CI, API contract, and automated tests.
- **User Story:** As Omar, I want every stock, invoice, and payment record to stay correct even when requests repeat or fail so that I can trust the numbers.
- **Trigger:** Any state-changing request; any code change pushed to the repository.
- **Pre-conditions:** CI pipeline and test database configured.
- **Post-conditions:** Operations commit atomically or not at all; test suites gate every merge.
- **Main Flow:**
  1. The client sends a posting request with an Idempotency-Key.
  2. The idempotency layer looks up the key for the organization and endpoint.
  3. For a new key, the service runs the operation in a single database transaction and stores the response with the key.
  4. For a repeated key with the same request hash, the stored response returns.
  5. On every pull request, CI runs lint, type check, unit tests, integration tests against PostgreSQL, and a build check.
- **Alternate Flows:**
  - A1: A repeated key with a different request hash returns 422 `IDEMPOTENCY_KEY_REUSED`.
  - A2: A transaction failure rolls back all records and stores no idempotency result.
  - A3: A failing mandatory check blocks merge and deployment.
- **Acceptance Criteria:**
  - [ ] Receipts, adjustments, confirmations, shipments, invoice issuance, and payments all require an Idempotency-Key.
  - [ ] Automated tests cover tenant isolation, permissions, concurrent reservations, duplicate postings, rollback, payment allocation, invoice calculation, and immutability.
  - [ ] Integration tests run against a real PostgreSQL instance.
  - [ ] The OpenAPI document is generated from code and published with each build.
  - [ ] Migrations are version-controlled and validated in CI.
  - [ ] Critical business-logic paths reach at least 80% coverage.

### 7.5 Feature Requirements — Should Have (P1)

#### P1-F001 — Dashboard and Enhanced Reports
- **Description:** A dashboard and extra reports covering sales and purchase totals, low-stock alerts, and outstanding invoice summaries.
- **User Story:** As Omar, I want a daily overview so that I see sales, low stock, and unpaid balances at a glance.
- **Trigger:** User opens Home or Reports.
- **Pre-conditions:** P0 reporting is stable; actor holds `reports.read`.
- **Post-conditions:** Metrics display with defined calculations.
- **Main Flow:**
  1. The client calls `GET /api/v1/dashboard`.
  2. The server calculates metrics for the active organization: sales total, purchase total (selected date range, default current month), count of low-stock products, total outstanding balance.
  3. The client renders metric cards and links to detailed reports.
- **Alternate Flows:**
  - A1: Organizations without data show zero values and empty-state links.
  - A2: A product is low-stock when available quantity is at or below its configured threshold.
- **Acceptance Criteria:**
  - [ ] Sales totals count issued, non-void invoices in the date range; purchase totals count confirmed purchase orders in the date range.
  - [ ] Each metric states its calculation in a tooltip.
  - [ ] Low-stock threshold is configurable per product.
  - [ ] The dashboard returns only active-organization data and loads within the Section 8 performance targets.

#### P1-F002 — Consistent List Filtering
- **Description:** Every major list supports search, status filters, date-range filters, and sorting through one reusable pattern. Basic server-side pagination and search ship with each P0 list.
- **User Story:** As Salma, I want to filter orders by status and date so that I find the right order quickly.
- **Trigger:** User changes a filter or sort on a list.
- **Pre-conditions:** The list's P0 feature is complete.
- **Post-conditions:** Results reflect the filters; the URL preserves them.
- **Main Flow:**
  1. The user selects filters.
  2. The client sends them as query parameters.
  3. The server validates allowed fields, applies filters and sorting with indexes, and returns a paginated result.
  4. The client updates the table and URL.
- **Alternate Flows:**
  - A1: An unsupported filter or sort field returns 400.
  - A2: No matches show the empty state with "Clear filters".
- **Acceptance Criteria:**
  - [ ] Filters exist on orders, receipts, shipments, invoices, and payments for status and date range.
  - [ ] Sorting and filtering happen on the server.
  - [ ] Filter state survives page reload through the URL.

#### P1-F003 — User Invitations
- **Description:** Administrators invite users by email; invitees set their own password.
- **User Story:** As Hana, I want to invite employees by email so that I never set or share passwords.
- **Trigger:** Administrator selects "Invite User".
- **Pre-conditions:** Actor holds `users.manage`.
- **Post-conditions:** An invitation exists with a hashed token and 7-day expiry; acceptance creates the membership.
- **Main Flow:**
  1. The administrator enters email and roles.
  2. The client sends `POST /api/v1/invitations`.
  3. The server stores a hashed single-use token and emails the invitation link.
  4. The invitee opens the link and sets a name and password through `POST /api/v1/invitations/:token/accept`.
  5. The server creates the user and membership with the assigned roles and audits the acceptance.
- **Alternate Flows:**
  - A1: An expired or used token returns 410 with a message to request a new invitation.
  - A2: An existing account accepts and gains a new membership without a new password.
  - A3: Administrators can revoke pending invitations.
- **Acceptance Criteria:**
  - [ ] Tokens are single-use, expire after 7 days, and are stored only as hashes.
  - [ ] Invitation endpoints are rate limited.
  - [ ] Invitation creation, acceptance, and revocation are audited.

#### P1-F004 — Partial Shipments, Partial Invoicing, and Backorders
- **Description:** A sales order can ship in several shipments and be invoiced per shipment. Remaining quantities are tracked as backorders.
- **User Story:** As Karim, I want to ship what is in stock and keep the rest on backorder so that customers receive goods sooner.
- **Trigger:** User selects "Ship" and enters quantities below the reserved total.
- **Pre-conditions:** The P0 shipment and invoicing flows are stable; the pilot business requires partial fulfillment. If the pilot requires it at launch, the feature is reclassified to P0 before implementation.
- **Post-conditions:** Each shipment decreases stock and reservations by its quantities; the order tracks shipped and remaining quantities.
- **Main Flow:**
  1. Karim enters the shipped quantity per line (≤ remaining reserved quantity).
  2. The client sends `POST /api/v1/sales-orders/:id/shipments` with an Idempotency-Key.
  3. The server posts the shipment for those quantities and keeps the remaining reservations.
  4. The order becomes PARTIALLY_SHIPPED, then SHIPPED when all quantities ship.
  5. Omar creates one invoice per shipment from `POST /api/v1/shipments/:id/invoices`.
- **Alternate Flows:**
  - A1: A shipped quantity above the remaining reserved quantity returns 400.
  - A2: A shipment with all zero quantities returns 400.
  - A3: Cancelling a PARTIALLY_SHIPPED order releases only the remaining reservations.
- **Acceptance Criteria:**
  - [ ] The sum of shipped quantities per line never exceeds the confirmed quantity.
  - [ ] Each shipment is invoiced at most once (excluding void invoices).
  - [ ] Remaining quantities appear on the order detail page.
  - [ ] All P0 idempotency and concurrency guarantees apply to each partial shipment.

#### P1-F005 — CSV Import and Export
- **Description:** Users import products and contacts from CSV and export selected reports to CSV.
- **User Story:** As Omar, I want to import my existing product list so that I start without retyping it.
- **Trigger:** User selects "Import" on Products or Contacts, or "Export CSV" on a report.
- **Pre-conditions:** Actor holds `products.write` or `contacts.write` for import; `reports.read` for export.
- **Post-conditions:** A validated file imports atomically; exports contain only the active organization's data.
- **Main Flow:**
  1. The user uploads a CSV (maximum 5 MB and 5,000 rows).
  2. The server parses the file and validates every row (required fields, formats, duplicates within the file and against existing records).
  3. The client shows a preview with valid-row and error-row counts.
  4. When zero errors exist, the user confirms and the server imports all rows in one transaction.
- **Alternate Flows:**
  - A1: Any invalid row blocks the import and offers a downloadable error report with row numbers and reasons.
  - A2: Exceeding file limits returns 400.
  - A3: Cell values starting with formula characters are neutralized on export.
- **Acceptance Criteria:**
  - [ ] An import commits all rows or none.
  - [ ] Duplicate SKUs and emails are detected before commit.
  - [ ] Imports and exports are audited.
  - [ ] Exports are organization-scoped and require `reports.read`.

#### P1-F006 — Usability Improvements
- **Description:** Interface refinements that raise speed and clarity for daily users.
- **User Story:** As Salma, I want fast, keyboard-friendly forms so that I enter orders without using the mouse.
- **Trigger:** Pilot feedback identifies usability blockers.
- **Pre-conditions:** P0 interfaces are complete.
- **Post-conditions:** Updated interfaces meet the criteria below.
- **Main Flow:**
  1. The team prioritizes usability issues from pilot sessions.
  2. The frontend implements the improvements.
  3. QA retests the affected core workflows.
- **Alternate Flows:**
  - A1: An improvement that threatens a P0 deadline moves to the next release.
- **Acceptance Criteria:**
  - [ ] Forms and tables operate by keyboard (tab order, Enter to submit, Escape to close dialogs).
  - [ ] Destructive actions show confirmation dialogs.
  - [ ] Loading, success, and error feedback follow Section 7.3 in every module.
  - [ ] Desktop and tablet layouts pass visual review on supported browsers.

---

## 8. Non-Functional Requirements

### Performance
- Main application pages reach a usable state within 2 seconds at p95 under the documented test environment.
- Standard API operations respond within 500 ms at p95 under the documented load, excluding reports, imports, and exports.
- Common list, search, and detail queries use indexes on `organization_id` plus the filtered columns.
- All collections paginate on the server.
- Reports complete within 5 seconds for the agreed pilot dataset (10,000 products, 100,000 stock movements, 50,000 invoices); the load-test profile (dataset, concurrency of 25 simultaneous users, duration) is documented before Phase 4.
- Long-running reports and exports must not block ordinary operations.

### Security
- Passwords use Argon2id. No plaintext or reversible storage.
- Sessions use server-side storage, HttpOnly, Secure, and SameSite cookies; CSRF protection covers every state-changing request.
- Rate limiting applies to login, registration, password, and invitation endpoints.
- Authentication errors are generic to prevent account enumeration.
- Every endpoint enforces authorization on the server with default deny.
- Tenant scope derives from the session and verified membership, never from client input.
- All inputs validate server-side against explicit schemas; queries are parameterized.
- CORS uses an explicit allowlist; security headers and a Content Security Policy apply.
- Secrets are stored in environment-specific secret management and never committed.
- Production error responses exclude stack traces and internal details.
- TLS 1.3 is used where the platform supports it, with TLS 1.2 as the minimum; all production traffic uses HTTPS.
- Logs redact passwords, tokens, and secrets.

### Availability
- Target 99.9% monthly availability on managed hosting. No contractual SLA applies in v1.
- Daily database backups with 30-day retention.
- Initial recovery targets: RPO 24 hours, RTO 4 hours. Both are validated by a restoration test before public launch.
- Health checks (`GET /api/v1/health`) report application and database status.

### Scalability
- The modular monolith scales vertically and horizontally by running stateless application instances behind the platform load balancer; sessions persist in PostgreSQL.
- Indexes and query plans are reviewed for the pilot dataset size.
- Redis, background workers, and read replicas are introduced only when a measured requirement exists.

### Accessibility
- WCAG 2.1 AA conformance for core workflows: labeled form fields, sufficient color contrast, visible focus, keyboard operability, and accessible error messages.

### Compatibility
- Chrome 100+, Safari 15+, Firefox 100+, and Edge (Chromium) on desktop and tablet.
- Responsive layouts for desktop and tablet; phone layouts are not a v1 requirement.

### Data and Compliance
- NexusERP v1 claims no formal certification (GDPR, ISO 27001, SOC 2) and no tax or e-invoicing compliance.
- HIPAA is out of scope; the product is not designed for protected health information.
- Privacy by design: collect only data needed for operations, restrict access to personal and commercial data, document data collection, retention, export, correction, and deletion procedures, and publish a privacy notice matching actual practices.
- Deletion requests respect business-record integrity: finalized invoices, payments, and audit history are retained according to documented retention rules.
- A legal assessment of the target jurisdiction (Egypt or others) is required before any jurisdiction-specific invoicing or tax feature.
- Encryption in transit (HTTPS) and at rest (hosting platform, AES-256 or equivalent) with documented key management responsibilities.
- Monetary values use exact decimal types; floating-point arithmetic is prohibited for money and quantities.

### Observability
- Structured JSON logs with request ID, organization ID, user ID, route, status, and latency, excluding sensitive data.
- Error monitoring captures unhandled exceptions with request context.
- Metrics: API latency, error rate, failed or rolled-back critical operations, idempotent replays, authentication failures, reconciliation failures, database performance.
- Alerting: an error rate above 1% over 5 minutes triggers an alert; any reconciliation failure triggers an alert.

---

## 9. Technical Architecture

### 9.1 Frontend Stack
- React 18+ with TypeScript, built with Vite, as a single-page application.
- Tailwind CSS for styling; React Router for routing; TanStack Query for server state.
- React Hook Form with Zod schemas for forms and validation.
- A centralized API client handling authentication, CSRF tokens, error mapping, and retries with stable Idempotency-Keys.
- Reusable components: layouts, tables, forms, dialogs, skeleton loaders, error panels.
- Tests: Vitest and React Testing Library (unit and component), Playwright (end-to-end).

### 9.2 Backend Stack
- Node.js LTS with NestJS and TypeScript, deployed as one primary application.
- REST API versioned under `/api/v1` with OpenAPI generated from code.
- NestJS validation pipes with explicit DTOs.
- Tests: Jest (unit), Supertest (HTTP integration), real PostgreSQL for integration tests.
- A worker process is added only when a requirement for asynchronous jobs exists.

**Modules (one NestJS module per domain):**

| Module | Responsibility |
|---|---|
| AuthModule | Registration, login, logout, sessions, rate limiting, CSRF |
| OrganizationsModule | Organizations, memberships, settings, module availability, tenant context |
| UsersModule | User profiles and accounts |
| AccessControlModule | Roles, permissions, authorization guards |
| ContactsModule | Customers, suppliers, addresses |
| ProductsModule | Products, categories, units of measure, prices |
| InventoryModule | Warehouses, balances, reservations, movements, receipts, shipments, adjustments |
| PurchasingModule | Purchase orders and receipt coordination |
| SalesModule | Sales orders, confirmation, shipment coordination |
| InvoicingModule | Invoices, payments, allocations |
| ReportingModule | Read-only organization-scoped reports |
| AuditModule | Append-only audit records |
| PlatformModule | Configuration, health checks, idempotency, shared infrastructure |

Modules expose explicit service interfaces. A module never writes another module's tables directly. Cross-module workflows (for example confirm sales order → reserve stock) call the owning module's service within one database transaction. Circular dependencies are prohibited.

### 9.3 Database Architecture
- PostgreSQL is the system of record; Prisma provides the ORM and version-controlled migrations.
- Every organization-owned table includes `organization_id`; foreign keys between organization-owned tables are composite (`organization_id`, `id`) to prevent cross-tenant relations.
- CHECK constraints: `on_hand >= 0`, `reserved >= 0`, `reserved <= on_hand`, quantities and amounts non-negative where applicable.
- Unique constraints: (`organization_id`, lower(`sku`)), (`organization_id`, lower(`email`)) for contacts, (`organization_id`, `number`) for numbered documents, (`organization_id`, `idempotency_key`, `endpoint`).
- `stock_movements` and `audit_logs` are append-only: update and delete privileges are revoked for the application database role.
- Concurrency: stock balance rows are locked or updated with conditional statements (`UPDATE ... WHERE on_hand - reserved >= :qty`); rows are always acquired in ascending product ID order to prevent deadlocks.
- Document numbers come from `number_sequences` rows locked inside the creating transaction.
- Separate development, test, and production databases.
- Redis is not required in v1; PostgreSQL stores sessions, idempotency records, and rate-limit counters. Redis is added only for a measured need, and never as the source of truth for stock or invoice balances.

### 9.4 Authentication and Authorization Design
- **Authentication:** Server-side sessions stored in PostgreSQL; the browser holds only an opaque session ID in an HttpOnly, Secure, SameSite=Lax cookie. No bearer-token authentication runs in parallel.
- **CSRF:** A per-session CSRF token returned by the server is sent in a custom header on every state-changing request and verified server-side.
- **Session lifecycle:** Idle timeout 30 minutes; absolute lifetime 12 hours; sessions are invalidated on logout, password change, and membership deactivation.
- **Tenant resolution:** A global guard loads the session, the active organization, and the user's active membership on every request, and attaches `organizationId` and the effective permission set to the request context. Repositories require this context; queries without it fail.
- **Authorization:** Permission strings follow `resource.action`: `contacts.read|write`, `products.read|write`, `inventory.read|write|receive|ship|adjust`, `purchasing.read|write`, `sales.read|write`, `invoices.read|write|issue|void`, `payments.read|record|reverse`, `reports.read`, `audit.read`, `users.manage`, `roles.manage`, `settings.manage`. Each endpoint declares its required permission in a decorator.
- **Default roles:** Administrator (all), Manager (all except `users.manage`, `roles.manage`, `settings.manage`), Sales (`contacts.*`, `products.read`, `inventory.read`, `sales.*`, `invoices.read`), Inventory (`products.read`, `inventory.*`, `purchasing.read`, `sales.read`), Purchasing (`contacts.*`, `products.read`, `inventory.read`, `purchasing.*`).

### 9.5 API Design

All endpoints use the `/api/v1` prefix and require authentication except register, login, and health. "Idem." marks endpoints that require an Idempotency-Key.

| Method | Endpoint | Feature | Permission | Idem. |
|---|---|---|---|---|
| POST | /auth/register | P0-F001 | public | No |
| POST | /auth/login | P0-F001 | public | No |
| POST | /auth/logout | P0-F001 | authenticated | No |
| GET | /auth/me | P0-F001 | authenticated | No |
| POST | /auth/switch-organization | P0-F002 | authenticated | No |
| GET | /organizations/current | P0-F002 | authenticated | No |
| PUT | /organizations/current | P0-F002 | settings.manage | No |
| GET | /organizations/current/modules | P0-F002 | authenticated | No |
| PUT | /organizations/current/modules/:key | P0-F002 | settings.manage | No |
| GET | /memberships | P0-F003 | users.manage | No |
| POST | /memberships | P0-F003 | users.manage | No |
| PUT | /memberships/:id/roles | P0-F003 | users.manage | No |
| DELETE | /memberships/:id | P0-F003 | users.manage | No |
| GET | /roles | P0-F003 | roles.manage | No |
| POST | /roles | P0-F003 | roles.manage | No |
| PUT | /roles/:id | P0-F003 | roles.manage | No |
| GET | /contacts | P0-F004 | contacts.read | No |
| POST | /contacts | P0-F004 | contacts.write | No |
| GET | /contacts/:id | P0-F004 | contacts.read | No |
| PUT | /contacts/:id | P0-F004 | contacts.write | No |
| POST | /contacts/:id/archive | P0-F004 | contacts.write | No |
| GET | /products | P0-F005 | products.read | No |
| POST | /products | P0-F005 | products.write | No |
| GET | /products/:id | P0-F005 | products.read | No |
| PUT | /products/:id | P0-F005 | products.write | No |
| POST | /products/:id/archive | P0-F005 | products.write | No |
| GET, POST | /product-categories | P0-F005 | products.read / write | No |
| GET, POST | /units-of-measure | P0-F005 | products.read / write | No |
| GET | /warehouses | P0-F006 | inventory.read | No |
| POST | /warehouses | P0-F006 | inventory.write | No |
| PUT | /warehouses/:id | P0-F006 | inventory.write | No |
| GET | /inventory/stock-balances | P0-F006 | inventory.read | No |
| GET | /inventory/stock-movements | P0-F006 | inventory.read | No |
| POST | /inventory/adjustments | P0-F006 | inventory.adjust | Yes |
| GET | /purchase-orders | P0-F007 | purchasing.read | No |
| POST | /purchase-orders | P0-F007 | purchasing.write | No |
| GET | /purchase-orders/:id | P0-F007 | purchasing.read | No |
| PUT | /purchase-orders/:id | P0-F007 | purchasing.write | No |
| POST | /purchase-orders/:id/confirm | P0-F007 | purchasing.write | No |
| POST | /purchase-orders/:id/cancel | P0-F007 | purchasing.write | No |
| POST | /purchase-orders/:id/receipts | P0-F007 | inventory.receive | Yes |
| GET | /goods-receipts | P0-F007 | inventory.read | No |
| GET | /sales-orders | P0-F008 | sales.read | No |
| POST | /sales-orders | P0-F008 | sales.write | No |
| GET | /sales-orders/:id | P0-F008 | sales.read | No |
| PUT | /sales-orders/:id | P0-F008 | sales.write | No |
| POST | /sales-orders/:id/confirm | P0-F008 | sales.write | Yes |
| POST | /sales-orders/:id/cancel | P0-F008 | sales.write | Yes |
| POST | /sales-orders/:id/shipments | P0-F009 | inventory.ship | Yes |
| GET | /shipments | P0-F009 | inventory.read | No |
| GET | /shipments/:id | P0-F009 | inventory.read | No |
| POST | /sales-orders/:id/invoices | P0-F010 | invoices.write | No |
| GET | /invoices | P0-F010 | invoices.read | No |
| GET | /invoices/:id | P0-F010 | invoices.read | No |
| PUT | /invoices/:id | P0-F010 | invoices.write (DRAFT only) | No |
| POST | /invoices/:id/issue | P0-F010 | invoices.issue | Yes |
| POST | /invoices/:id/void | P0-F010 | invoices.void | Yes |
| GET | /payments | P0-F011 | payments.read | No |
| POST | /payments | P0-F011 | payments.record | Yes |
| POST | /payments/:id/reverse | P0-F011 | payments.reverse | Yes |
| GET | /audit-logs | P0-F012 | audit.read | No |
| GET | /reports/stock-on-hand | P0-F013 | reports.read | No |
| GET | /reports/stock-movements | P0-F013 | reports.read | No |
| GET | /reports/outstanding-invoices | P0-F013 | reports.read | No |
| GET | /reports/document-statuses | P0-F013 | reports.read | No |
| GET | /reports/stock-reconciliation | P0-F013 | reports.read | No |
| GET | /health | P0-F014 | public | No |
| GET | /dashboard | P1-F001 | reports.read | No |
| GET | /reports/sales-totals, /reports/purchase-totals, /reports/low-stock | P1-F001 | reports.read | No |
| POST | /invitations | P1-F003 | users.manage | No |
| POST | /invitations/:token/accept | P1-F003 | public | No |
| POST | /shipments/:id/invoices | P1-F004 | invoices.write | No |
| POST | /imports/products, /imports/contacts | P1-F005 | products.write / contacts.write | No |

### 9.6 Idempotency Design
- Clients generate a UUID per user action and send it in the `Idempotency-Key` header; the client reuses the same key for retries of that action.
- The `idempotency_keys` table is scoped by (`organization_id`, `endpoint`, `key`) with a unique constraint and stores the request hash, response status and body, and expiry.
- Same key and same request hash within 24 hours returns the stored response. Same key with a different hash returns 422 `IDEMPOTENCY_KEY_REUSED`. Expired keys are purged by a scheduled cleanup.
- The key record and the business change commit in the same transaction. A failed transaction stores nothing.
- Database state guards (status checks, unique constraints) provide a second layer so that duplicate posting is impossible even without the key.

### 9.7 Data Model

| Entity | Key Fields | Relationships |
|---|---|---|
| Organization | id, name, currency_code, default_payment_terms_days, created_at | has many Memberships, all organization-owned entities |
| User | id, email (unique), password_hash, name, must_change_password, is_active | has many Memberships, Sessions |
| Membership | id, organization_id, user_id, is_active | belongs to Organization and User; has many Roles through MembershipRole |
| Role / RolePermission / MembershipRole | role: id, organization_id, name, is_system; permission codes; membership-role links | Role has many permissions; Membership has many Roles |
| Session | id, user_id, active_organization_id, csrf_token_hash, expires_at, last_seen_at | belongs to User |
| OrganizationModule | organization_id, module_key, is_enabled | belongs to Organization |
| Contact | id, organization_id, name, email, phone, is_customer, is_supplier, address fields, is_archived | referenced by PurchaseOrder, SalesOrder, Invoice, Payment |
| ProductCategory, UnitOfMeasure | id, organization_id, name (unit: abbreviation) | referenced by Product |
| Product | id, organization_id, sku, name, category_id, uom_id, purchase_price, selling_price, low_stock_threshold, is_archived | referenced by document lines, StockBalance |
| Warehouse | id, organization_id, name, is_active, is_default | has many StockBalances |
| StockBalance | organization_id, warehouse_id, product_id, on_hand, reserved, version | unique per (warehouse, product) |
| StockMovement (append-only) | id, organization_id, warehouse_id, product_id, type (RECEIPT, SHIPMENT, ADJUSTMENT), quantity_delta, source_type, source_id, reason, created_by, created_at | references StockBalance keys |
| StockReservation | id, organization_id, sales_order_line_id, warehouse_id, product_id, quantity, status (ACTIVE, CONSUMED, RELEASED) | belongs to SalesOrderLine |
| PurchaseOrder, PurchaseOrderLine | po: number, supplier_id, warehouse_id, status, total; line: product_id, quantity_ordered, quantity_received, unit_cost, line_total | belongs to Contact (supplier) |
| GoodsReceipt, GoodsReceiptLine | number, purchase_order_id, received_by, received_at; line: po_line_id, quantity | belongs to PurchaseOrder |
| SalesOrder, SalesOrderLine | so: number, customer_id, warehouse_id, status, total; line: product_id, quantity, unit_price, line_total | belongs to Contact (customer) |
| Shipment, ShipmentLine | number, sales_order_id, shipped_by, shipped_at; line: so_line_id, quantity | belongs to SalesOrder |
| Invoice, InvoiceLine | number, sales_order_id, shipment_id, customer_id, status, issue_date, due_date, total, void_reason; line: product_id, quantity, unit_price, line_total | belongs to SalesOrder, Contact |
| Payment | number, customer_id, amount, date, method, reference, reverses_payment_id, reason | has many PaymentAllocations |
| PaymentAllocation | payment_id, invoice_id, amount | belongs to Payment and Invoice |
| IdempotencyKey | organization_id, endpoint, key, request_hash, response_status, response_body, expires_at | scoped per organization |
| NumberSequence | organization_id, document_type, prefix, next_value | one row per document type per organization |
| AuditLog (append-only) | id, organization_id, user_id, action, record_type, record_id, details (JSON), created_at | belongs to Organization |

### 9.8 State Machines

| Document | States and Transitions |
|---|---|
| Purchase Order | DRAFT → CONFIRMED → PARTIALLY_RECEIVED → RECEIVED; DRAFT or CONFIRMED (no receipts) → CANCELLED |
| Sales Order | DRAFT → CONFIRMED → SHIPPED; DRAFT or CONFIRMED → CANCELLED; P1 adds PARTIALLY_SHIPPED between CONFIRMED and SHIPPED |
| Invoice | DRAFT → ISSUED → PARTIALLY_PAID → PAID; ISSUED (no allocations) → VOID; DRAFT → VOID |
| Reservation | ACTIVE → CONSUMED (shipment) or RELEASED (cancellation) |

### 9.9 Infrastructure and Deployment
- Docker images for the backend and a static build of the frontend served by the hosting platform or the backend.
- Hosting: Railway or Render for the MVP, with managed PostgreSQL providing backups, access control, and encryption at rest. Final provider selection compares cost, database reliability, backup and restore options, deployment simplicity, and data location.
- Environments: development, test, and production, each with separate configuration and secrets.
- GitHub Actions pipeline: dependency install with lockfile check, lint, format check, type check, unit tests, integration tests against PostgreSQL, build verification, Docker build, migration validation, and protected deployment.
- Deployment documentation covers migration, rollback, backup, and restore procedures.
- Deployments are blocked when any mandatory check fails.

### 9.10 External Integrations
- None required for v1 operation.
- PostHog (or an equivalent privacy-conscious tool) receives aggregate product events; it receives no passwords, tokens, invoice contents, payment details, or unnecessary personal data.
- Error-monitoring service [TBD] receives exceptions with request context and redacted data.

---

## 10. Implementation Phases

### Phase 1 — Foundation and Platform
- **Goal:** Establish the platform and the multi-tenant security foundation so every later module builds on verified isolation and permissions.
- **Duration:** 4 weeks (2026-10-19 to 2026-11-15)
- **Tasks:**
  - [ ] Finalize PRD approval and core workflow definitions (P0 scope frozen).
  - [ ] Record architecture decisions and the initial entity-relationship diagram.
  - [ ] Create the repository, branch conventions, Docker development environment, and GitHub Actions pipeline (P0-F014).
  - [ ] Scaffold the NestJS backend and the React frontend; set up design tokens and base components.
  - [ ] Create PostgreSQL schema foundations, Prisma migrations, and seed data.
  - [ ] Implement authentication, sessions, CSRF, and rate limiting (P0-F001).
  - [ ] Implement organizations, memberships, tenant-resolution guard, settings, and module flags (P0-F002).
  - [ ] Implement RBAC, default roles, and user administration (P0-F003).
  - [ ] Implement the audit module and audit log viewer (P0-F012).
  - [ ] Implement customers, suppliers, and the product catalog (P0-F004, P0-F005).
  - [ ] Write initial tenant-isolation and permission tests.
  - [ ] Identify candidate pilot businesses and schedule owner interviews.
- **Validation:** A user registers, signs in, switches organization, manages users, roles, contacts, and products; automated tests prove no cross-tenant read or write; CI is green; the Gate 1 and Gate 2 approvals are recorded.

### Phase 2 — Inventory and Purchasing
- **Goal:** Deliver reliable, auditable stock management and supplier purchasing.
- **Duration:** 4 weeks (2026-11-16 to 2026-12-13)
- **Tasks:**
  - [ ] Implement the idempotency layer and document numbering (P0-F014).
  - [ ] Implement warehouses, stock balances, and database constraints (P0-F006).
  - [ ] Implement the immutable stock-movement history and stock adjustments (P0-F006).
  - [ ] Implement purchase orders and status transitions (P0-F007).
  - [ ] Implement partial goods receipts with over-receipt prevention (P0-F007).
  - [ ] Add audit records for adjustments, receipts, and purchasing actions (P0-F012).
  - [ ] Write concurrency tests for simultaneous adjustments and receipts.
  - [ ] Write duplicate-request and rollback tests for receipts and adjustments.
  - [ ] Build the stock-reconciliation query.
  - [ ] Secure at least one pilot business commitment.
- **Validation:** A scripted scenario creates a purchase order, receives it in two partial receipts, and adjusts stock; balances equal the sum of movements; repeated requests create no duplicates; the reconciliation query returns zero discrepancies.

### Phase 3 — Sales, Invoicing, and Operational Reporting
- **Goal:** Complete the core business cycle through sales, shipment, invoicing, payment, and reports.
- **Duration:** 4 weeks (2026-12-14 to 2027-01-10)
- **Tasks:**
  - [ ] Implement sales orders, confirmation, and all-or-nothing reservation (P0-F008).
  - [ ] Implement cancellation with reservation release (P0-F008).
  - [ ] Implement shipments with stock deduction (P0-F009).
  - [ ] Implement invoices from shipped orders, issue, immutability, and void (P0-F010).
  - [ ] Implement payments, allocations, over-allocation prevention, and reversal (P0-F011).
  - [ ] Implement the five minimum reports (P0-F013).
  - [ ] Write end-to-end integration tests for the full purchase-to-payment cycle.
  - [ ] Write concurrency tests for competing reservations and payments.
  - [ ] Write the initial Playwright end-to-end tests for the core workflow.
  - [ ] Define pilot tasks, success criteria, and sample data.
- **Validation:** The complete cycle runs end to end on persisted data; invoice totals and balances match expected values under defined test vectors; concurrent confirmations never over-reserve; all Phase 3 P0 acceptance criteria pass.

### Phase 4 — Hardening, Pilot, and Release
- **Goal:** Verify security, correctness, and usability, run the pilot, and decide on public launch.
- **Duration:** 4 weeks (2027-01-11 to 2027-02-07)
- **Tasks:**
  - [ ] Run the security and tenant-isolation review across all endpoints, reports, and exports.
  - [ ] Run performance tests against the documented dataset and load profile.
  - [ ] Run transaction, concurrency, and idempotency regression suites.
  - [ ] Fix critical usability issues from internal testing.
  - [ ] Verify backup restoration with a documented restore test.
  - [ ] Complete deployment, operations, privacy, and limitation documentation.
  - [ ] Complete the beta-readiness review (Gate 3) and begin the pilot in Week 14 (2027-01-18).
  - [ ] Collect pilot feedback and measurements at 1 and 2 weeks.
  - [ ] Implement P1 features that fit capacity, only when Phase 3 exit criteria are met and P0 tests are green.
  - [ ] Complete the release-readiness review (Gate 4).
- **Validation:** All release-blocking conditions in Section 14 are cleared; the pilot business completes the core cycle; metrics in Section 12 are measured and reported. When any release blocker remains, public launch is postponed.

---

## 11. Build Order and Dependency Rules

1. Authentication and tenant isolation (P0-F001, P0-F002) are built before any business module.
2. RBAC (P0-F003) and the audit module (P0-F012) are built before inventory, purchasing, sales, and invoicing, so every business action is permissioned and audited from the first release.
3. Contacts and products (P0-F004, P0-F005) precede all documents that reference them.
4. Idempotency and numbering (P0-F014) precede the first posting endpoint.
5. Inventory (P0-F006) precedes purchasing receipts and sales reservations.
6. Purchasing (P0-F007) precedes sales so that stock exists for realistic sales testing.
7. Sales (P0-F008) precedes shipments (P0-F009), which precede invoices (P0-F010), which precede payments (P0-F011).
8. Reports (P0-F013) follow the documents they summarize.
9. P1 features follow only after the preceding P0 phase meets its exit criteria.

---

## 12. Success Metrics and KPIs

### Business Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Pilot adoption | At least 1 pilot business completes the full core cycle with representative real data | Observed pilot sessions and the workflow completion log |
| Unassisted task completion | At least 70% of pilot users complete assigned core tasks without developer assistance after onboarding | Observed task records; report number of users and attempts |
| Commercial validation | Continue-use and willingness-to-pay recorded for 100% of pilot businesses | 30-day structured interview; treated as evidence, not proof of product-market fit |

### Product Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Core-workflow completion rate | Greater than 80% of valid attempted core workflows complete without developer intervention | PostHog events `workflow_started` and `workflow_completed` plus session observation |
| Sales-order processing time | Median under 3 minutes to create and confirm a standard sales order | Event timestamps from order creation start to confirmation, excluding insufficient-stock cases |
| Workflow blockers | 0 unresolved critical usability issues at launch | Issue tracker review at Gate 4 |

### Technical Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| API latency | p95 under 500 ms | Load test on the documented environment; production latency monitoring |
| Page usability time | p95 under 2 seconds | Lighthouse and real-user timing in the documented test environment |
| Production error rate | Under 0.1% of eligible requests (numerator: 5xx responses; denominator: all non-health-check requests; window: 7 days) | Error monitoring and structured logs |
| Tenant-isolation tests | 100% pass | CI test suite |
| Critical-path test coverage | At least 80% of defined critical business-logic paths | Coverage report in CI |
| Critical security defects | 0 unresolved at public launch | Security review and dependency audit |
| Backup restoration | 1 successful documented restore test before public launch | Restoration test record |

### Data Accuracy Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Stock reconciliation | 0 unexplained differences between balances and movements | Daily reconciliation report during pilot and in CI |
| Duplicate postings | 0 unintended duplicate receipts, adjustments, shipments, invoices, or payments | Duplicate-request and concurrency tests; pilot transaction review |
| Invoice calculation accuracy | 100% match on defined test vectors | Automated unit tests |
| Payment allocation accuracy | 100% of allocations respect balance rules | Automated tests and pilot data inspection |

### User Satisfaction Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Pilot-user satisfaction | Average at least 4 out of 5 | Post-task survey; report the sample size |

- **Tracking Tool:** PostHog for product analytics; error monitoring [TBD] and structured logs for technical metrics; the test suite and CI for correctness metrics.
- **Review Frequency:** 1 week, 2 weeks, and 30 days after pilot start (2027-01-25, 2027-02-01, 2027-02-17). If the pilot start moves, review dates move with it. The 1-week and 2-week reviews inform the Gate 4 decision; the 30-day review informs post-launch scope.
- **Owner:** Product Owner (Mohamed).

---

## 13. Timeline and Milestones

- **Start Date:** 2026-10-19
- **Target Launch:** 2027-02-07 (public launch, conditional on release criteria)
- **Total Duration:** 16 weeks

| Milestone | Description | Due Date | Status | Owner |
|---|---|---|---|---|
| Kickoff | Project start; repository and environment setup begin | 2026-10-19 | TODO | Product Owner |
| PRD Approved | Gate 1: PRD and MVP boundaries approved | 2026-10-23 | TODO | Product Owner |
| Architecture Approved | Gate 2: architecture, data model, tenant isolation, and transaction design approved | 2026-10-30 | TODO | Engineering Lead |
| Phase 1 Done | Foundation, auth, tenancy, RBAC, contacts, products complete | 2026-11-15 | TODO | Engineering Lead |
| Phase 2 Done | Inventory and purchasing complete | 2026-12-13 | TODO | Engineering Lead |
| Phase 3 Done | Sales, invoicing, payments, reports complete | 2027-01-10 | TODO | Engineering Lead |
| Beta Launch | Gate 3: pilot beta starts | 2027-01-18 | TODO | Product Owner |
| Phase 4 Done | Hardening, pilot observation, release review complete | 2027-02-07 | TODO | Engineering Lead |
| Public Launch | Gate 4: public release if all release criteria are met | 2027-02-07 | TODO | Product Owner |
| 30-Day Pilot Review | Final comparison of results against targets | 2027-02-17 | TODO | Product Owner |

**Planning assumptions:** The schedule assumes one primary developer or a small part-time team. Scope changes are assessed for schedule impact before acceptance. The plan is re-estimated from measured velocity after Phase 1.

---

## 14. Risk Register

Scoring: Likelihood × Impact, where High = 3, Medium = 2, Low = 1. Risks rated "Critical" or "Medium to High" in planning are scored at the higher value (High).

| ID | Description | Likelihood | Impact | Score | Mitigation | Owner |
|---|---|---|---|---|---|---|
| R-001 | Scope creep from ERP breadth delays the core workflow | High | High | 9 | Enforce MoSCoW; freeze P0 scope; require impact assessment for changes; defer P1 first | Product Owner |
| R-002 | Inventory or financial data corruption under concurrency (duplicate postings, overselling, invalid allocations) | High | High | 9 | PostgreSQL transactions, row locking and conditional updates, idempotency keys, constraints, immutable records, concurrency tests | Engineering Lead |
| R-003 | Cross-tenant data leakage | Medium | High | 6 | Central tenant guard, composite foreign keys, never trust client organization IDs, negative authorization tests in CI | Engineering Lead |
| R-004 | Limited development capacity versus the 16-week plan | High | High | 9 | Weekly time budget and velocity tracking, incremental integration, final phase reserved for stabilization, cut P1 before security or testing | Product Owner |
| R-005 | No suitable pilot business secured in time | Medium | High | 6 | Identify pilots in Phase 1, interview owners before finalizing workflows, secure a commitment by the end of Phase 2, use scripted scenarios as a fallback | Product Owner |
| R-006 | Users assume full accounting or tax compliance | Medium | High | 6 | Clear limitation statements in UI and documentation, "Operational invoice" labeling, no unverified compliance claims, legal review before local features | Product Owner |
| R-007 | Inadequate backup and recovery causes unrecoverable data loss | Medium | High | 6 | Daily backups, documented RPO and RTO, restricted destructive access, restoration test before launch | Engineering Lead |
| R-008 | Poor usability or mismatch with real business workflows | High | High | 9 | Early owner interviews, workflow validation before implementation, task-based pilot testing, prioritize blockers over optional features | Product Owner |
| R-009 | Deployment, dependency, or hosting problems block a reliable launch | Medium | High | 6 | Automated CI checks, lockfiles, vulnerability monitoring, tested migrations, documented rollback, production configuration verification | Engineering Lead |

### Risk Management Process
- The risk register is reviewed weekly during development and before each milestone approval.
- Critical security and data-integrity risks are release blockers.
- Scope is reduced before tenant isolation, transaction integrity, or essential testing is compromised.

### Release-Blocking Conditions
Public launch does not proceed while any of the following is unresolved:
1. A reproducible cross-tenant data-access vulnerability.
2. A critical defect that can corrupt stock, invoice, or payment records.
3. Duplicate posting or concurrency failures in critical operations.
4. An unresolved critical security vulnerability.
5. No verified backup and recovery procedure.
6. A core business workflow that cannot be completed reliably.
7. Product claims that misrepresent accounting or tax-compliance capabilities.

---

## 15. Stakeholders and Approvals

### Stakeholders

| Name | Role | Involvement | Contact |
|---|---|---|---|
| Mohamed | Product Owner / PM | Owns vision, priorities, MVP scope; approves PRD and scope changes; final product decisions | [TBD] |
| [TBD] | Engineering Lead | Reviews feasibility, architecture, database design, security, estimates; approves technical readiness | [TBD] |
| [TBD] | Pilot Business Representative | Validates workflows, participates in beta testing, gives acceptance feedback | [TBD] |
| [TBD] | Frontend Developer | Implements the React application | [TBD] |
| [TBD] | Backend Developer | Implements the NestJS modules and database | [TBD] |
| [TBD] | Designer | Provides UI design assets and usability review | [TBD] |
| [TBD] | QA | Owns test strategy, end-to-end tests, and release verification | [TBD] |

### Approval Gates

| Gate | Approver | Required By | Status |
|---|---|---|---|
| Gate 1 — Requirements approval (PRD and MVP boundaries) | Product Owner and Engineering Lead | 2026-10-23 | Pending |
| Gate 2 — Architecture approval (architecture, data model, tenant isolation, transaction design) | Engineering Lead | 2026-10-30 | Pending |
| Gate 3 — Beta approval | Product Owner and Engineering Lead; Pilot Business Representative confirms readiness | 2027-01-18 | Pending |
| Gate 4 — Public-release approval | Product Owner and Engineering Lead | 2027-02-07 | Pending |

No implementation begins until Gates 1 and 2 are approved.

---

## 16. References and Links

| Reference | Link |
|---|---|
| Design Files | [TBD] |
| Repository | [TBD] |
| API Docs (OpenAPI) | [TBD] |
| Architecture Diagrams | [TBD] |
| Staging Environment | [TBD] |
| Production Environment | [TBD] |
| CI/CD Pipeline | [TBD] |
| Monitoring Dashboard | [TBD] |
| Related PRDs | [TBD] |
| Slack Channel | [TBD] |
| Meeting Notes | [TBD] |
| PRD File | docs/PRD.md |

---

## 17. Revision History

| Version | Date | Author | Changes |
|---|---|---|---|
| v1.0 | 2026-10-17 | Mohamed | Initial PRD created |