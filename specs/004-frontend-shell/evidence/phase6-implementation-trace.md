# Phase 6 implementation trace

## T063 — shell sample values

`TopBar` in `frontend/src/components/shell/top-bar.tsx` calls
`sampleShellService.listOrganizations()` and `sampleShellService.getPreviewUser()`
through React Query. `sampleShellService` in
`frontend/src/services/sample-shell-service.ts` implements `ShellService` and
copies `SAMPLE_ORGANIZATIONS` and `SAMPLE_PREVIEW_USER` from
`frontend/src/mocks/sample-data.ts`. The `ShellService` contract in
`frontend/src/services/shell-service.ts` contains method signatures only; sample
names and values are not embedded in the component or service interface. The
top bar displays the visible “Sample data” marker.

## T064 — sample-data surfaces

The application sample organization and preview user are rendered in the marked
top bar. The development gallery renders sample records and carries its own
visible “Sample data” marker in `frontend/src/dev/gallery/gallery-route.tsx`.

## T065 — shared package types

The shared package exports `DecimalString` from `shared/src/schemas/index.ts`;
`frontend/src/services/catalog-service.ts` imports it from
`@nexuserp/shared`. `ErrorEnvelopeSchema` is imported from that package in
`frontend/src/lib/api-client.ts`, and `HealthReport` is imported in
`frontend/src/features/health/use-health.ts`. Types local to the shell and
catalog service describe feature-specific operations and records not defined by
the shared package. `frontend/src/mocks/sample-data.ts` imports the record and
shell contract types from their service modules rather than duplicating those
definitions.
