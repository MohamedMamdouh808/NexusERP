/**
 * The shell's half of the service interface (T026).
 *
 * FR-041 is specific about the top bar: the sample organization and the preview
 * user "MUST be reached through the same service interface as every other sample
 * value rather than being written into the interface". So they are read here,
 * asynchronously and shaped like the calls the real client will make, exactly as
 * the catalogue's records are read through `catalog-service.ts` (FR-036, FR-037).
 *
 * When authentication arrives, `listOrganizations` becomes the membership list
 * the server returns for the signed-in user and `getPreviewUser` becomes the
 * current user. No component changes: the top bar reads these two operations
 * and does not know where they are implemented (FR-036).
 */

/** A sample organization. Not a real organization, and it scopes nothing (FR-041). */
export interface SampleOrganization {
  readonly id: string;
  readonly name: string;
}

/**
 * The preview user. There is no session in this feature and no sign-in, so this
 * is a placeholder that says so rather than an identity anything is derived from
 * (FR-014, FR-015).
 */
export interface PreviewUser {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

/**
 * The interface the sample implementation satisfies today and the real client
 * satisfies later. Two read operations, because that is all the shell asks for.
 */
export interface ShellService {
  listOrganizations(): Promise<readonly SampleOrganization[]>;
  getPreviewUser(): Promise<PreviewUser>;
}
