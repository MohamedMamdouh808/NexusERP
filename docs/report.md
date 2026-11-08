# NexusERP — Project Report

**Repository:** `MohamedMamdouh808/NexusERP`
**Generated:** 2026-11-08
**Status:** Draft
**Source of truth:** `docs/PRD.md` (v1.0, 2026-10-17), `docs/staging-deployment.md`, `.specify/memory/constitution.md` (v1.1.0), `design-system/nexuserp/MASTER.md`

---

## 1. Project Identity

| Field | Value |
|-------|-------|
| Name | NexusERP |
| Type | Modular, multi-tenant ERP SaaS |
| Target Market | Small retail, wholesale, and general trading businesses |
| Tech Stack | React 18+, TypeScript, Vite, Tailwind CSS (frontend); Node.js LTS, NestJS, Prisma, PostgreSQL (backend); GitHub Actions (CI) |
| Repository | MohamedMamdouh808/NexusERP |
| PRD | `docs/PRD.md` (v1.0) |
| Design System | `design-system/nexuserp/MASTER.md` |

### Problem Addressed
Small trading businesses manage purchasing, inventory, sales, and invoicing in spreadsheets or disconnected applications, causing duplicate data entry, inaccurate stock levels, order-processing mistakes, delayed invoicing, and limited visibility. Existing ERP systems are too complex, expensive, or difficult to configure.

### Project Purpose
NexusERP connects purchasing, inventory, sales, invoicing, and payment tracking through validated workflows so that one business action updates every related record consistently. Each organization operates in an isolated workspace and enables only the modules it needs.

---

## 2. Architecture Overview

### 2.1 Monorepo Structure

```
NexusERP/
├── backend/              # NestJS modular monolith API (port 3000)
├── frontend/             # React SPA with Vite (port 5173)
├── shared/               # Contract package: Zod schemas, error codes, permissions
├── database/             # Prisma schema, migrations, seed data
├── scripts/              # Build, lint, check, secrets, supabase-data-api scripts
├── docs/                 # PRD, staging runbook, readiness audit, this report
├── specs/                # Spec Kit feature directories (001-005)
├── design-system/        # UI design system (MASTER.md, pages)
├── .specify/             # Spec Kit configuration and constitution
├── .github/workflows/    # CI pipeline (lint, typecheck, test, integration, migrations, contract, build, secret-scan, workflow)
└── package.json          # Root workspace (workspaces: frontend, backend, database, shared)
```

### 2.2 Backend Architecture (NestJS Modular Monolith)

Per PRD Section 9, one NestJS application with one module per domain:

| Module | Responsibility | Status |
|--------|---------------|--------|
| AuthModule | Registration, login, logout, sessions, rate limiting, CSRF | **Not implemented** (P0-F001, TODO) |
| OrganizationsModule | Organizations, memberships, settings, module availability, tenant context | **Not implemented** (P0-F002, TODO) |
| UsersModule | User profiles and accounts | **Not implemented** |
| AccessControlModule | Roles, permissions, authorization guards | **Not implemented** |
| ContactsModule | Customers, suppliers, addresses | **Not implemented** |
| ProductsModule | Products, categories, units of measure, prices | **Not implemented** |
| InventoryModule | Warehouses, balances, movements, receipts, shipments, adjustments | **Not implemented** |
| PurchasingModule | Purchase orders and receipt coordination | **Not implemented** |
| SalesModule | Sales orders, confirmation, shipment coordination | **Not implemented** |
| InvoicingModule | Invoices, payments, allocations | **Not implemented** |
| ReportingModule | Read-only organization-scoped reports | **Not implemented** |
| AuditModule | Append-only audit records | **Not implemented** |
| PlatformModule | Configuration, health checks, idempotency, shared infrastructure | **Partially implemented** |

### 2.3 Frontend Architecture (React SPA)

- **Routing:** React Router with feature-based page structure under `frontend/src/features/`
- **State:** TanStack Query for server state
- **Forms:** React Hook Form with Zod schemas
- **Styling:** Tailwind CSS with design-system tokens
- **Testing:** Vitest + React Testing Library (unit/component), Playwright (E2E)
- **Data layer:** Uses sample/mock services (`sample-shell-service.ts`, `sample-catalog-service.ts`) — **no real API connection yet**

### 2.4 API Contract (PRD Section 9.5)

All endpoints under `/api/v1`. Only **one endpoint exists** in the current backend:

| Method | Endpoint | Status |
|--------|----------|--------|
| GET | `/api/v1/health` | **Implemented** (platform foundation) |

All 55+ documented endpoints (auth, organizations, contacts, products, inventory, purchasing, sales, shipping, invoicing, payments, reports, audit, users, roles, settings) are **not implemented**.

---

## 3. Current State of Implementation

### 3.1 What Exists (Platform Foundation)

The backend implements the **platform foundation only** — approximately 2,800+ lines of TypeScript across ~40 files:

| Component | File(s) | Status |
|-----------|---------|--------|
| Configuration validation (Zod) | `backend/src/config/configuration.ts` | Implemented |
| Structured JSON logging (Pino) | `backend/src/common/logging/logger.ts` | Implemented |
| Log redaction (secret scrubbing) | `backend/src/common/logging/logger.ts` | Implemented |
| Request ID tracing (AsyncLocalStorage) | `backend/src/common/logging/request-id.middleware.ts`, `request-context.ts` | Implemented |
| Unified error envelope `{code, message, details, requestId}` | `backend/src/common/errors/all-exceptions.filter.ts` | Implemented |
| Database client lifecycle (Prisma) | `backend/src/platform/prisma/prisma.service.ts` | Implemented |
| Transaction Unit of Work | `backend/src/platform/transaction/transaction.service.ts` | Implemented |
| Health endpoint | `backend/src/platform/health/health.controller.ts` | Implemented |
| Default-deny permission guard | `backend/src/common/guards/permission.guard.ts` | Implemented (but `effectivePermissions()` returns `[]`) |
| Permission catalog (50 codes, 13 modules) | `shared/src/permissions/index.ts` | Implemented |
| Role templates (5 default roles) | `shared/src/permissions/index.ts` | Implemented |
| Reference data seed | `database/prisma/seed.ts` | Implemented |
| OpenAPI generation & drift check | `backend/src/openapi/` | Implemented |
| CI pipeline (9 jobs) | `.github/workflows/ci.yml` | Implemented |

### 3.2 What Is Missing (All P0 Features)

| Feature | PRD ID | Sprint | Status |
|---------|--------|--------|--------|
| Authentication & Session Management | P0-F001 | S1 | Not started |
| Organization Workspaces & Tenant Isolation | P0-F002 | S1 | Not started |
| RBAC & User Administration | P0-F003 | S2 | Not started |
| Customer & Supplier Management | P0-F004 | S2 | Not started |
| Product Catalog | P0-F005 | S2 | Not started |
| Inventory Balances & Movements | P0-F006 | S3 | Not started |
| Purchase Orders & Goods Receipts | P0-F007 | S4 | Not started |
| Sales Orders & Stock Reservation | P0-F008 | S5 | Not started |
| Shipments & Stock Deduction | P0-F009 | S5 | Not started |
| Invoicing | P0-F010 | S6 | Not started |
| Payment Recording & Allocation | P0-F011 | S6 | Not started |
| Audit Log | P0-F012 | S2 | Not started |
| Minimum Operational Reporting | P0-F013 | S6 | Not started |
| Reliability & Quality Foundation | P0-F014 | S1–S8 | Partially (platform only) |

### 3.3 Database Schema (Prisma)

**Existing tables (3 — reference data only):**

| Table | Purpose |
|-------|---------|
| `permissions` | Product permission catalog (id, code, module, description) |
| `role_templates` | Default role definitions (id, key, name, is_system) |
| `role_template_permissions` | Join table (composite PK) |

**Missing tables (all organization-owned, none created):**

`users`, `memberships`, `organizations`, `sessions`, `login_attempts`, `warehouses`, `document_sequences`, `contacts`, `product_categories`, `units_of_measure`, `products`, `stock_balances`, `stock_movements`, `stock_reservations`, `purchase_orders`, `purchase_order_lines`, `goods_receipts`, `sales_orders`, `sales_order_lines`, `shipments`, `shipment_lines`, `invoices`, `invoice_lines`, `payments`, `payment_allocations`, `idempotency_keys`, `number_sequences`, `audit_logs`, `organization_modules`

### 3.4 Frontend State

The frontend is a complete UI shell with ~40 feature pages across 13 domains, but **all data comes from sample/mock services**:

- `sample-shell-service.ts` — organizations, preview user (mock)
- `sample-catalog-service.ts` — products, contacts, inventory, purchasing, sales, invoicing, payments (mock)
- `sample-data.ts` — static sample records

No real API client connects to the backend. The `api-client.ts` exists with `requestJson()` but is not wired to any feature.

---

## 4. Constitution Compliance (v1.1.0)

The project constitution at `.specify/memory/constitution.md` defines 9 principles. Current compliance status:

| Principle | Requirement | Current Status |
|-----------|-------------|----------------|
| **I. Tenant Isolation** | `organization_id` on all org tables, composite FKs, 404 for cross-tenant | **Missing** — no org table exists |
| **II. Default Deny** | Every endpoint declares permission; absent = denied | **Partially** — guard exists but no permissions resolved |
| **III. Transactional Integrity** | Multi-record ops in one transaction; idempotency; immutability | **Partially** — TransactionService exists; no posting endpoints |
| **IV. Exact Decimals** | `NUMERIC(14,2/4/3)`, no Float, JSON strings | **Met** (vacuous — no numeric columns yet) |
| **V. Test-First** | Critical rules tested first; real PostgreSQL; 80% coverage | **Partially** — infrastructure exists; no business-path tests |
| **VI. Modular Boundaries** | One module per domain; no cross-table access | **Partially** — platform boundary exists; no domain modules |
| **VII. Honest Boundaries** | No tax/accounting claims | **Met** — README Legal section states this |
| **VIII. Design & Accessibility** | UI from design system; WCAG 2.1 AA | **N/A** — backend only |
| **IX. Scope Discipline** | P0 first; P3 never | **Missing** — P0 features all unstarted |

---

## 5. CI Pipeline Status

`.github/workflows/ci.yml` defines 9 mandatory jobs:

| Job | Purpose | Status |
|-----|---------|--------|
| lint | ESLint + schema numeric types | Implemented |
| typecheck | `tsc` across all workspaces | Implemented |
| unit | Jest unit tests + coverage | Implemented |
| integration | Jest integration tests vs real PostgreSQL | Implemented |
| migrations | `prisma migrate deploy` + drift check | Implemented |
| contract | OpenAPI drift vs committed contract | Implemented |
| build | Shared + API + Web production builds | Implemented |
| secret-scan | Repository credential scan | Implemented |
| workflow | CI-no-deploy assertion | Implemented |

**Note:** CI gates run on push to `main` but do **not** block deployment (single-branch workflow, no branch protection).

---

## 6. Roadmap & Milestones

Per PRD Section 3 & 6:

| Milestone | Date | Criteria |
|-----------|------|----------|
| Multi-tenant foundation (auth, orgs, RBAC, contacts, products) | 2026-11-15 | Zero cross-tenant access |
| Transaction-safe inventory & purchasing | 2026-12-13 | Idempotent postings, audit logging |
| Sales, shipments, invoicing, payments, reports | 2027-01-10 | Full operational cycle |
| Pilot beta (1 business, real data) | 2027-01-18 | Gate 3 approval |
| Public launch | 2027-02-07 | Gate 4 + release-blocking conditions cleared |

### Release-Blocking Conditions (PRD Section 14)
Public launch blocked until all cleared:
1. No reproducible cross-tenant data-access vulnerability
2. No critical defect corrupting stock/invoice/payment records
3. No duplicate posting or concurrency failures
4. No unresolved critical security vulnerability
5. Verified backup & recovery procedure
6. All core workflows completable reliably
7. No misrepresented accounting/tax-compliance claims

---

## 7. Improvement Opportunities

### Immediate (P0, S1–S2)

1. **Authentication module** — Registration, login, logout, sessions, Argon2id password hashing, CSRF tokens, rate limiting
2. **Organization & tenant isolation** — Organization table, memberships, tenant-scoped queries, 404 for cross-tenant
3. **RBAC module** — Role assignment to users, permission resolution in guard, decorator-based endpoint authorization
4. **Contacts & Products modules** — Full CRUD with archive (not delete), unique constraints per organization
5. **Replace sample services** — Wire frontend `sample-shell-service.ts` and `sample-catalog-service.ts` to real API clients

### Near-term (P0, S3–S6)

6. **Inventory module** — Warehouses, stock balances, movements, reservations, receipts, shipments, adjustments
7. **Purchasing module** — Purchase orders, status transitions, goods receipts
8. **Sales module** — Sales orders, confirmation, stock reservation
9. **Invoicing module** — Invoice creation, issuing, immutability, void
10. **Payments module** — Payment recording, allocation, reversal
11. **Audit log module** — Append-only audit records
12. **Reporting module** — Read-only organization-scoped reports

### Infrastructure & Quality

13. **Idempotency key middleware** — For all posting endpoints
14. **Rate limiting** — Login, registration, posting endpoints (PostgreSQL-backed counters)
15. **Pagination** — Server-side pagination on all list endpoints (default 25, max 100)
16. **OpenAPI contract** — Generate from code, commit, drift-check in CI
17. **Frontend build** — Currently not building (chunk size warning from recharts)

### Documentation Gaps

18. **`docs/report.md`** — This file (was exploration narrative, now replaced with proper project report)
19. **OpenAPI spec** — Not yet generated/committed
20. **Deployment runbook** — `docs/staging-deployment.md` exists but references non-existent `vercel.json`/`render.yaml`

---

## 8. Key Files & Locations

| File | Purpose |
|------|---------|
| `docs/PRD.md` | Product requirements (v1.0) |
| `docs/staging-deployment.md` | Deployment runbook |
| `docs/backend-readiness.md` | Backend readiness audit |
| `design-system/nexuserp/MASTER.md` | UI design system |
| `.specify/memory/constitution.md` | Engineering principles (v1.1.0) |
| `.specify/feature.json` | Active feature directory selector |
| `specs/005-auth-sessions-org/` | Current feature spec (auth, sessions, org) |
| `backend/src/app.module.ts` | Root module (global guard, filter, middleware) |
| `backend/src/platform/` | Infrastructure (health, prisma, transaction) |
| `shared/src/permissions/index.ts` | Permission catalog & role templates |
| `shared/src/schemas/index.ts` | Zod schemas (decimal, money, quantity, error envelope) |
| `frontend/src/services/api-client.ts` | HTTP client with error envelope (unused) |
| `frontend/src/services/sample-shell-service.ts` | Mock shell service |
| `frontend/src/services/sample-catalog-service.ts` | Mock catalog service |

---

## 9. Open Questions / Decisions Needed

| Question | Owner | Status |
|----------|-------|--------|
| Engineering Lead identity | Product Owner | [TBD] — needed for Gate 2 |
| Error-monitoring vendor | Engineering Lead | [TBD] — PRD Section 9.10 |
| Hosting provider (Railway vs Render) | Engineering Lead | [TBD] — PRD Section 9.9 |
| Design assets (UI kit, layouts) | Designer | [TBD] — needed before Phase 1 frontend |
| Pilot business identification | Product Owner | [TBD] — needed before end of Phase 2 |
| `docs/report.md` was previously an exploration narrative; this document replaces it with a structured project report | — | Resolved |

---

## 10. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| v1.0 | 2026-11-08 | Engineering | Initial project report (replaces exploration narrative) |