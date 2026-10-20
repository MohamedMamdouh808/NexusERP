/**
 * The sample implementation of the shell service (T026).
 *
 * It reads the values from `src/mocks/sample-data.ts`, which is the one place
 * sample data lives, so no component has to import that module and
 * `no-direct-sample-imports.spec.ts` (T060) can hold the rule (FR-036).
 *
 * Two honesties are built in rather than left to the caller:
 *
 *  - **It writes nothing.** There is no `localStorage`, `sessionStorage`,
 *    IndexedDB or cookie anywhere in this file, and the rows are returned as
 *    copies, so a caller cannot mutate the sample set into a "saved" state
 *    (FR-014, FR-068).
 *  - **The organization it returns scopes nothing.** Selecting one changes what
 *    the shell displays and nothing else; nothing here is sent anywhere, which
 *    is why there is no request to intercept (FR-014, FR-041).
 */

import {
  SAMPLE_ORGANIZATIONS,
  SAMPLE_PREVIEW_USER,
} from '../mocks/sample-data';
import type { PreviewUser, SampleOrganization, ShellService } from './shell-service';

/**
 * The values are static, but the operations are still asynchronous: they are
 * shaped like the requests the real client will make, so replacing this file
 * changes no component (FR-037).
 */
async function listOrganizations(): Promise<readonly SampleOrganization[]> {
  return SAMPLE_ORGANIZATIONS.map((organization) => ({ ...organization }));
}

async function getPreviewUser(): Promise<PreviewUser> {
  return { ...SAMPLE_PREVIEW_USER };
}

/** The one instance the shell reads. */
export const sampleShellService: ShellService = {
  listOrganizations,
  getPreviewUser,
};
