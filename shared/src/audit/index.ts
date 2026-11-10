/**
 * Audit action codes (FR-015).
 *
 * Every audited action emits exactly one code, committed in the same transaction as the
 * business change. Codes are the machine-readable vocabulary of the audit log — clients
 * and filters branch on the code, never on free-form text.
 */
export const AUDIT_ACTIONS = {
  // Authentication
  authLogin: 'auth.login',
  authLoginFailed: 'auth.login_failed',
  authLockout: 'auth.lockout',
  authPasswordChanged: 'auth.password_changed',
  authPasswordChangeFailed: 'auth.password_change_failed',
  authRegister: 'auth.register',

  // Roles and permissions
  rolesCatalogueProvisioned: 'roles.catalogue_provisioned',
  rolesCreated: 'roles.created',
  rolesUpdated: 'roles.updated',
  rolesDeleted: 'roles.deleted',

  // Members
  membersCreated: 'members.created',
  membersRolesChanged: 'members.roles_changed',
  membersDeactivated: 'members.deactivated',
  membersReactivated: 'members.reactivated',
} as const;

/** The type of a single audit action code value. */
export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
