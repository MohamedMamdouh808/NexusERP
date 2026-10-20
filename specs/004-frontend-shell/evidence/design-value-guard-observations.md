# Design-Value Guard Observations (T036, FR-051, SC-002)

Consolidated in [deliberate-failures.md](deliberate-failures.md).

## Defect Run (exit code 1)

Deliberate raw hex colour `#123456` introduced in `frontend/src/components/shell/breadcrumb.tsx:47`.

```text
check-no-raw-design-values: 1 raw design value(s) outside the token file.
Every colour must come from src/styles/tokens.css. Use var(--token) or a utility class.
  D:\web-projects\NexusERP\frontend\src\components\shell\breadcrumb.tsx:47  [hex colour literal]  <nav className="breadcrumb" aria-label="Breadcrumb" style={{ color: '#123456' }}>
```

## Passing Run (exit code 0)

Raw value removed:

```text
check-no-raw-design-values: 45 files scanned, no raw design values
```
