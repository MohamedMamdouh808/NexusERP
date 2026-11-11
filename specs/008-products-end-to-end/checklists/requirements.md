# Specification Quality Checklist: Products End to End

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-11-11
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] CHK001 No implementation details (languages, frameworks, APIs)
- [x] CHK002 Focused on user value and business needs
- [x] CHK003 Written for non-technical stakeholders
- [x] CHK004 All mandatory sections completed

## Requirement Completeness

- [x] CHK005 No [NEEDS CLARIFICATION] markers remain
- [x] CHK006 Requirements are testable and unambiguous
- [x] CHK007 Success criteria are measurable
- [x] CHK008 Success criteria are technology-agnostic (no implementation details)
- [x] CHK009 All acceptance scenarios are defined
- [x] CHK010 Edge cases are identified
- [x] CHK011 Scope is clearly bounded
- [x] CHK012 Dependencies and assumptions identified

## Feature Readiness

- [x] CHK013 All functional requirements have clear acceptance criteria
- [x] CHK014 User scenarios cover primary flows
- [x] CHK015 Feature meets measurable outcomes defined in Success Criteria
- [x] CHK016 No implementation details leak into specification

## Notes

- **CHK001**: The specification states WHAT the product catalog must do. The
  source description named the tables and the endpoints; those are recorded as
  requirements ("the system MUST keep products per organization", "listing
  products MUST require the product read permission") rather than as a schema or
  a route design, and the implementation pattern is left to the plan.
- **CHK003**: The personas are the PRD's (Omar as the operator of the catalog).
  The terms a business user meets are used: SKU, category, unit of measure,
  purchase price, selling price, low-stock threshold, archived.
- **CHK004**: User Scenarios & Testing, Requirements, Constitution Compliance,
  Success Criteria and Assumptions are all present and populated.
- **CHK005**: The description answered every point that would otherwise need a
  clarification, and where it left a choice open the default is recorded in
  Assumptions (required fields, zero prices allowed, the default units of
  measure, the usage check's present behaviour).
- **CHK006**: Each requirement names an observable outcome ("MUST be refused
  with the stale-version outcome", "MUST be visible to another", "MUST write an
  audit entry ... in the same transaction"). The two outcome names used -
  duplicate-record and stale-version - are the names the service already
  answers with elsewhere, so a test can assert them literally.
- **CHK008**: The success criteria are stated as user-visible outcomes and
  timings. The one technical figure (a catalog of 10,000 products answering a
  list request in under a second) names the catalogue size and the latency the
  business feels, not the storage engine or the query plan.
- **CHK009**: Six user stories, each with acceptance scenarios in Given/When/
  Then form, cover creation, retrieval, search, correction, retirement and the
  vocabulary of categories and units, plus the interface itself.
- **CHK010**: The edge cases cover the empty catalog, wildcard characters in a
  search term, out-of-range paging, the three ways a price can be wrong, an
  archived product's reserved SKU, a concurrent archive, the last product of a
  category, a direct call without the permission, and the service being
  unreachable while a form is open.
- **CHK011**: The out-of-scope list is explicit: variants, barcodes, images,
  price lists, import and export, and inventory stock.
- **CHK012**: The assumptions record the reused foundations, the required
  fields, the default units, the usage check's present behaviour and the
  dependency on the future purchasing, sales and inventory features.
- **CHK013**: Every functional requirement is covered by at least one acceptance
  scenario or edge case; FR-018 and FR-024 are covered by their own
  verification requirements (escaped wildcards, and a refusal proven with a
  stub).
- **CHK016**: The section on guards is written as requirements the build must
  satisfy (snake_case naming, row-level security with no policies, the
  isolated test schema, a regenerated contract) rather than as a list of tools
  to run.

### Items marked incomplete require spec updates before `/speckit.clarify` or `/speckit.plan`

### Clarification session 2026-11-11

Five ambiguities were resolved and written into the spec (one bullet each, in the
spec's own `## Clarifications` section):

1. The low-stock threshold's grain - one optional threshold per product, absent
   rather than zero, no computed flag, and the interface's single term.
2. The currency - one per organization, stored on the organization, exposed
   read-only, with the change of it deferred to the Organization settings
   feature.
3. The list's default - active products, with the filter visible and the
   archived products reachable.
4. Stock rows - none in this feature; the Inventory feature owns them, and the
   usage hook is the seam that will refuse archiving.
5. Name uniqueness - only the SKU is unique; a duplicate name warns without
   blocking, and lists show the SKU beside the name.

Because of these, the specification now also carries a new migration
requirement (the organization's currency) and two recorded follow-ups (the
Organization settings screen and registration choosing a currency; the
per-warehouse threshold override).
