/**
 * Every sample value the interface can show, in one place (T013).
 *
 * FR-036 and data-model.md section 7: sample data lives HERE and nowhere else,
 * and reaches a component only through `src/services/`. A component that imports
 * this module directly is a defect, checked by
 * `src/components/__tests__/no-direct-sample-imports.spec.ts` (T060).
 *
 * Two rules this file must not break:
 *
 *  1. **Money is a decimal string.** `'1250.00'`, never `1250.00`. A JavaScript
 *     number is IEEE-754 binary floating point and cannot represent most decimal
 *     fractions exactly, so an amount that passes through one can differ from the
 *     server's by a fraction of a unit (Principle IV, FR-039). The values here are
 *     strings all the way to the formatter, which does no arithmetic on them.
 *
 *  2. **A status is an API status name, verbatim.** The names below are the design
 *     system's status mapping and the values the API returns; the interface never
 *     invents, abbreviates or rewords one, and colour is never the only signal
 *     (FR-022, FR-044).
 *
 * Nothing here is real: no organization, person or document is represented, and
 * every surface that shows one of these values carries the "Sample data" marker
 * (FR-040, FR-041).
 */

import type { SampleRecord } from '../services/catalog-service';
import type { PreviewUser, SampleOrganization } from '../services/shell-service';

export const SAMPLE_ORGANIZATIONS: readonly SampleOrganization[] = [
  { id: 'sample-org-alpha', name: 'Sample Organization (Alpha)' },
  { id: 'sample-org-beta', name: 'Sample Organization (Beta)' },
];

/** The organization the shell starts on. Only ever one of `SAMPLE_ORGANIZATIONS`. */
export const SAMPLE_DEFAULT_ORGANIZATION_ID = SAMPLE_ORGANIZATIONS[0].id;

export const SAMPLE_PREVIEW_USER: PreviewUser = {
  id: 'sample-user-preview',
  name: 'Preview user',
  role: 'Not signed in',
};

/**
 * The sample rows. Twelve, so a page size of five produces three pages and the
 * pager and the "page after the first" state are reachable without special-casing.
 *
 * The statuses are chosen to cover the design system's status mapping rather than
 * to describe a plausible document history: every one of the five badge tones is
 * represented, so the mapping is demonstrated rather than asserted (FR-022, FR-044).
 */
export const SAMPLE_RECORDS: readonly SampleRecord[] = [
  { id: 'sample-0001', status: 'DRAFT', name: 'Heavy-duty shelving unit', amount: '1250.00' },
  { id: 'sample-0002', status: 'CONFIRMED', name: 'Pallet wrapping film', amount: '384.50' },
  { id: 'sample-0003', status: 'PARTIALLY_RECEIVED', name: 'Barcode scanner, cordless', amount: '2199.99' },
  { id: 'sample-0004', status: 'RECEIVED', name: 'Thermal label roll', amount: '96.00' },
  { id: 'sample-0005', status: 'CANCELLED', name: 'Forklift hire, one week', amount: '1875.00' },
  { id: 'sample-0006', status: 'PAID', name: 'Steel pallet, galvanised', amount: '4300.00' },
  { id: 'sample-0007', status: 'ISSUED', name: 'Safety glove, cut-resistant', amount: '612.75' },
  { id: 'sample-0008', status: 'PARTIALLY_PAID', name: 'Racking inspection service', amount: '780.40' },
  { id: 'sample-0009', status: 'VOID', name: 'Obsolete stock write-off', amount: '0.00' },
  { id: 'sample-0010', status: 'SHIPPED', name: 'Wooden pallet collar', amount: '145.20' },
  { id: 'sample-0011', status: 'ACTIVE', name: 'Reserved: dispatch crate', amount: '308.00' },
  { id: 'sample-0012', status: 'CONSUMED', name: 'Consumed: packing tape', amount: '57.85' },
];
