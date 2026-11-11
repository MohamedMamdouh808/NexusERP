# Implementation Plan: Contacts End to End

**Branch**: `006-rbac-audit-log` | **Date**: 2026-11-10 | **Spec**: [specs/007-contacts-e2e/spec.md](spec.md)  
**Input**: Feature specification from `specs/007-contacts-e2e/spec.md` (P0-F004 Customer and Supplier Management)

## Summary

Build the Contacts domain end to end:
1. **Backend**: A dedicated `contacts` table partitioned by organization with composite keys (`organization_id`, `id`), case-insensitive unique email index per organization, auto-generated sequence code (`CUST-00001` or `SUPP-00001`), integer versioning for optimistic locking, and soft-archive flags.
2. **API**: REST endpoints protected by `contacts.read` and `contacts.write` with server-side search, filtering, pagination, usage-hook checks on archive, and transactional audit logging on all mutations.
3. **Frontend**: Replace mock catalog service calls in Contacts screens (`ContactsPage`, `ContactDetailPage`, `ContactNewPage`, `ContactEditPage`) with a real HTTP client, render discrete address fields and dual role checkboxes, display inline server errors and concurrency alerts, and eliminate the "Sample data" banner while relocating mock contacts used by other sample modules to local mocks.

## Technical Context

**Language/Version**: TypeScript 5.6+ / Node.js 20+  
**Primary Dependencies**: 
- Backend: NestJS 11, Prisma 6.1, `@nestjs/swagger`, `zod`, `class-validator`, `class-transformer`
- Frontend: React 18, React Router 6, TanStack Query 5, `@nexuserp/ui`
- Shared: `@nexuserp/shared`
**Storage**: PostgreSQL 16+ via Prisma ORM (real database only; no SQLite)  
**Testing**: Jest (unit + integration against isolated schema `nexuserp_test`), Playwright/Vitest (frontend)  
**Target Platform**: Node.js Linux/Windows server, Modern Evergreen Browsers (desktop + mobile)  
**Project Type**: Monorepo with NestJS modular monolith (`backend/`), Vite React SPA (`frontend/`), Prisma (`database/`), and `@nexuserp/shared`  
**Performance Goals**: <200ms p95 for list and search queries up to 10k contacts per tenant  
**Constraints**:
- Strict multi-tenancy: every contact query scoped to `organizationId`.
- No floating-point numbers: exact decimals and strings for all identifiers and money.
- Real PostgreSQL integration tests: `DATABASE_URL` against `nexuserp_test` only.
- Strict optimistic concurrency control: reject updates when `version` does not match current state.
- No hard deletes: archival only, verified against usage hook.
**Scale/Scope**: ~10,000 contacts per organization, server-side pagination with default 25 and max 100 page size.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate question | Result |
|-----------|---------------|--------|
| I. Tenant Isolation | Which tables gain `organization_id` and composite FKs, and where does tenant scope enter the request context? | **PASS** — `contacts` table gains `organization_id` with composite unique constraint `(organization_id, id)`. Tenant scope is extracted by `SessionAuthGuard` into `RequestContext` and enforced in all Prisma queries. RLS enabled with no policies (deny-all default). |
| II. Server-Enforced Authority | Which permission does each new endpoint declare, and which state transitions are validated server-side? | **PASS** — `contacts.read` required for list and detail; `contacts.write` required for create, update, archive, restore. In-use check on archive enforced server-side. |
| III. Transactional Integrity | Which operations are multi-record, require an `Idempotency-Key`, or produce immutable posted records? | **PASS** — Create, update, archive, and restore all execute within `TransactionService.runInTransaction`. Sequence generation, contact record, and audit log commit or roll back together. |
| IV. Exact Decimals | What are the column precisions, and where does half-up rounding occur? | **PASS** — Contacts do not store monetary amounts or fractional quantities. Any future balance fields will use decimal strings. |
| V. Test-First | Which failing test is written first, and which critical-path coverage does this change reach? | **PASS** — Integration tests for tenant isolation, permission rejection, case-insensitive email duplicate, stale version refusal, and usage hook check are written first in `backend/test/integration/contacts.spec.ts`. |
| VI. Modular Boundaries | Which modules are touched, and does any module write another module's tables? | **PASS** — A new self-contained `ContactsModule` in `backend/src/modules/contacts/`. Other modules access contacts only through `ContactsService`. |
| VII. Honest Boundaries | Does anything here risk implying tax compliance or complete accounting? | **PASS** — Address fields are stored as plain unstructured/structured strings without claiming postal authority validation. |
| VIII. Design System & A11y | Which design tokens and PRD 7.3 UX rules apply, and what is the WCAG 2.1 AA impact? | **PASS** — Uses `@nexuserp/ui` components (`DataTable`, `Input`, `Select`, `Card`, `Badge`, `Button`, `Dialog`). Forms follow WCAG 2.1 AA with accessible labels and error messages. |
| IX. Scope Discipline | What is this feature's P0/P1/P2 classification, and is the preceding phase's exit criteria met for P1 work? | **PASS** — P0-F004 core ERP master data feature. Preceding authentication and RBAC foundations are completed and stable. |

## Project Structure

### Documentation (this feature)

```text
specs/007-contacts-e2e/
├── plan.md              # This file
├── research.md          # Decisions, best practices, and sequence generation
├── data-model.md        # Prisma schema, constraints, and audit structure
├── quickstart.md        # Manual verification and integration testing guide
├── contracts/
│   └── contacts-api.md  # Detailed OpenAPI endpoint specs
└── tasks.md             # Task decomposition
```

### Source Code

```text
backend/src/
├── modules/
│   └── contacts/
│       ├── contacts.module.ts
│       ├── contacts.controller.ts
│       ├── contacts.service.ts
│       ├── contacts-usage.hook.ts
│       └── dto/
│           ├── create-contact.dto.ts
│           ├── update-contact.dto.ts
│           ├── list-contacts.dto.ts
│           └── contact-response.dto.ts
backend/test/integration/
└── contacts.spec.ts

database/prisma/
├── schema.prisma
└── migrations/
    └── 20261110000010_create_contacts_table/
        └── migration.sql

frontend/src/
├── features/contacts/
│   ├── contacts-page.tsx
│   ├── contact-detail-page.tsx
│   ├── contact-new-page.tsx
│   ├── contact-edit-page.tsx
│   └── use-contacts.ts
├── services/
│   ├── contacts-client.ts
│   └── catalog-service.ts
└── mocks/
    ├── sample-data.ts
    └── sample-contacts.ts
```
