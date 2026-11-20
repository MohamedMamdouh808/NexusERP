# Specification Quality Checklist: Invoicing and Payments End to End

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-14
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

Note: this repository's specification convention (see `specs/012-sales-end-to-end/spec.md`) names permissions, HTTP status codes, error codes, and database-level guarantees in requirements because the constitution mandates them as reviewable, testable contracts. Those are product contracts of this codebase, not implementation choices, and are retained here.

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain (all 3 resolved by the owner, Session 2026-11-14)
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification beyond the repository's contract convention

## Notes

- Iteration 1 (2026-11-14): spec drafted; 3 [NEEDS CLARIFICATION] markers presented to the owner.
- Iteration 2 (2026-11-14): the owner resolved all three. Recorded in the spec's Clarifications session and encoded in FR-005, FR-011, FR-023, FR-025, FR-026, FR-040, FR-041, US4, Edge Cases, and Assumptions:
  - Q1: `POST /sales-orders/:id/invoices` requires `invoices.write` only (PRD 9.5 authoritative; no sales permission in addition; internal read of the order goes through the Sales service; another organization's order returns 404, never 403).
  - Q2: the outstanding and overdue figures cover exactly the selection matching the current filters, across all pages; one shared definition (database view or service function reused by the list, the later Outstanding Invoices report, and the Dashboard); one snapshot with rows and total; labelled "Outstanding in this selection" / "Overdue in this selection"; unfiltered figures added to the invariants script.
  - Q3: payments list status filter is the derived reversal state - Active (RECORDED), Reversed (REVERSED), All (default All) - one left-join query shared by filter, rows, and total; an independent method filter (Cash, Bank transfer, Card, Other, All); payment_reversals indexed on payment id; reversed payments show date and reason and stay visible labelled as reversed.
- No open items. The specification is ready for `/speckit.clarify` or `/speckit.plan`.
