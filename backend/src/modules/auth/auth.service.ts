import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../platform/prisma/prisma.service';
import {
  TransactionService,
  type TransactionClient,
} from '../../platform/transaction/transaction.service';
import { extendRequestContext } from '../../common/logging/request-context';
import { AccessControlService } from '../access-control/access-control.service';
import { AuditService } from '../audit/audit.service';
import { hash as argon2Hash, verify as argon2Verify } from 'argon2';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import {
  AUDIT_ACTIONS,
  DEFAULT_UNITS_OF_MEASURE,
  DEFAULT_CURRENCY,
  SWITCHABLE_MODULE_KEYS,
} from '@nexuserp/shared';

/**
 * Authentication service. Orchestrates registration, login, logout, current-user
 * lookup, and organization switching. All multi-record operations run inside a
 * single Prisma transaction (Constitution Principle III).
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaction: TransactionService,
    private readonly accessControl: AccessControlService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Registers a new user with their first organization. All writes run in one
   * transaction: any failure creates nothing (FR-001, Constitution Principle III).
   * The five role templates are materialized into the organization and the
   * Administrator membership links to the Administrator role, all atomically.
   */
  async register(
    email: string,
    password: string,
    organizationName?: string,
    currencyCode?: string,
  ) {
    return this.transaction.runInTransaction(async (tx) => {
      // 1. Create user with Argon2id-hashed password
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: await this.hashPassword(password),
        },
      });

      // 2. Create the first organization with the chosen identity/currency
      const organization = await tx.organization.create({
        data: {
          name: organizationName ?? `${email}'s Organization`,
          currencyCode: currencyCode ?? DEFAULT_CURRENCY,
        },
      });

      // 2b. Every switchable module starts enabled for a new workspace (FR-024).
      await tx.organizationModule.createMany({
        data: SWITCHABLE_MODULE_KEYS.map((key) => ({
          organizationId: organization.id,
          moduleKey: key,
          enabled: true,
        })),
      });

      // 3. Materialize the five template roles + permission links for this org
      const roleByTemplateKey = await this.accessControl.grantDefaultRolesAndPermissions(
        organization.id,
      );

      // 3b. The default units of measure, in the same transaction as the
      //     organization. A product cannot be created without a unit of measure,
      //     so an organization that starts empty must still be able to create
      //     its first product.
      await tx.unitOfMeasure.createMany({
        data: DEFAULT_UNITS_OF_MEASURE.map((unit) => ({
          organizationId: organization.id,
          name: unit.name,
          abbreviation: unit.abbreviation,
        })),
      });

      // 4. Create Administrator membership and link it to the Administrator role
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          isActive: true,
        },
      });

      const administratorRoleId = roleByTemplateKey.get('administrator');
      if (!administratorRoleId) {
        throw new Error('Administrator role provisioning failed');
      }
      await tx.membershipRole.create({
        data: {
          membershipId: membership.id,
          roleId: administratorRoleId,
          organizationId: organization.id,
        },
      });

      // Audit: role catalogue provisioned (FR-015)
      await this.audit.record({
        organizationId: organization.id,
        userId: user.id,
        action: AUDIT_ACTIONS.rolesCatalogueProvisioned,
        recordType: 'organization',
        recordId: organization.id,
        before: null,
        after: { roles: Array.from(roleByTemplateKey.keys()) },
      });

      // Audit: registration (FR-015)
      await this.audit.record({
        organizationId: organization.id,
        userId: user.id,
        action: AUDIT_ACTIONS.authRegister,
        recordType: 'user',
        recordId: user.id,
        before: null,
        after: { email, organizationId: organization.id },
      });

      // 5. Create default warehouse (FR-001)
      await tx.warehouse.create({
        data: {
          organizationId: organization.id,
          name: 'Default Warehouse',
          isDefault: true,
        },
      });

      // 6. Create default document sequence (FR-001)
      await tx.documentSequence.create({
        data: {
          organizationId: organization.id,
          name: 'invoice',
          currentValue: 0,
        },
      });

      // 7. Create session with 30-minute idle / 12-hour absolute expiry
      const { sessionId, rawToken } = await this.createSession(tx, user.id, membership.id);

      // 8. Generate CSRF token per session
      const csrfToken = this.generateCsrfToken();

      // Extend request context with tenant scope
      extendRequestContext({
        organizationId: organization.id,
      });

      return {
        user: { id: user.id, email: user.email, mustChangePassword: false },
        organization: { id: organization.id, name: organization.name },
        membership: {
          id: membership.id,
          roles: [{ id: administratorRoleId, key: 'administrator', name: 'Administrator' }],
        },
        session: { id: sessionId },
        sessionToken: rawToken,
        csrfToken,
      };
    });
  }

  /**
   * Logs in a user with email and password. Returns generic errors that never
   * reveal whether the email exists (FR-010).
   */
  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Always perform argon2 verification to avoid timing attacks that reveal
    // whether the email exists (FR-010).
    const passwordHash = user?.passwordHash ?? 'dummy';
    const isValid = user
      ? await this.verifyPassword(passwordHash, password)
      : await argon2VerifyDummy(password);

    if (!user || !isValid) {
      // Audit the failure before throwing (FR-030).
      // Known user → userId recorded, no organization. Unknown → neither.
      if (user) {
        await this.audit.loginFailure({
          userId: user.id,
          reasonCode: 'invalid_credentials',
        });
      } else {
        await this.audit.loginFailure({
          submittedAccount: email,
          reasonCode: 'unknown_account',
        });
      }
      // Record in the failed-login counter for rate limiting
      await this.recordFailedVerification(email);
      await this.checkFailedVerificationLimit(email);
      throw new NotFoundException('Invalid email or password.');
    }

    // Find active membership for this user
    const membership = await this.prisma.membership.findFirst({
      where: { userId: user.id, isActive: true },
      include: { organization: true },
    });

    if (!membership) {
      throw new NotFoundException('Invalid email or password.');
    }

    // Resolve membership roles
    const membershipRoles = await this.prisma.membershipRole.findMany({
      where: { membershipId: membership.id },
      include: { role: true },
    });

    // Create session
    const { sessionId, rawToken } = await this.createSession(this.prisma, user.id, membership.id);

    // Generate CSRF token
    const csrfToken = this.generateCsrfToken();

    extendRequestContext({
      organizationId: membership.organization.id,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        mustChangePassword: user.mustChangePassword,
      },
      membership: {
        id: membership.id,
        roles: membershipRoles.map((mr) => ({
          id: mr.role.id,
          key: mr.role.key,
          name: mr.role.name,
        })),
        organization: {
          id: membership.organization.id,
          name: membership.organization.name,
        },
      },
      session: { id: sessionId },
      sessionToken: rawToken,
      csrfToken,
    };
  }

  /**
   * Logs out a user by invalidating their session (FR-008).
   */
  async logout(tokenHash: string) {
    await this.prisma.session.deleteMany({
      where: { tokenHash },
    });
  }

  /**
   * Returns the current user's identity and active organization membership
   * from the session context (FR-004).
   */
  async me(userId: string, membershipId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
      include: {
        organization: { include: { organizationModules: true } },
        user: true,
      },
    });

    if (!membership || membership.userId !== userId || !membership.isActive) {
      throw new NotFoundException('Membership not found or inactive.');
    }

    // Resolve membership roles
    const membershipRoles = await this.prisma.membershipRole.findMany({
      where: { membershipId: membership.id },
      include: { role: true },
    });

    // The caller's effective permissions travel with the identity. The server
    // enforces every permission anyway; this lets the interface avoid offering
    // an action that would be refused - it is the same union the permission
    // guard resolves on every request.
    const permissions = await this.accessControl.getEffectivePermissions(membership.id);

    return {
      user: {
        id: membership.user.id,
        email: membership.user.email,
        mustChangePassword: membership.user.mustChangePassword,
      },
      membership: {
        id: membership.id,
        // The member's display name in THIS organization. A name belongs to a
        // membership, not to the account, so the dashboard can greet a member
        // without asking for a permission the member may not hold.
        name: membership.name,
        version: membership.version,
        roles: membershipRoles.map((mr) => ({
          id: mr.role.id,
          key: mr.role.key,
          name: mr.role.name,
        })),
        isActive: membership.isActive,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        // The currency the organization's prices are in. Read-only here: changing
        // it belongs to the organization settings feature.
        currencyCode: membership.organization.currencyCode,
        // The default due date of an operational invoice: issue date plus this
        // many days. Read-only here: editing it belongs to the organization
        // settings feature.
        defaultPaymentTermsDays: membership.organization.defaultPaymentTermsDays,
        // The modules this organization has switched on - the interface adapts
        // to this list without an extra call (FR-027). Always-on modules are not
        // listed here; they are implicit.
        enabledModules: membership.organization.organizationModules
          .filter((module) => module.enabled)
          .map((module) => module.moduleKey)
          .sort(),
      },
      permissions,
    };
  }

  /**
   * Updates the signed-in member's own display name (FR-026). Requires the
   * membership's current version so a stale write is refused. Audits the
   * change in the same transaction.
   */
  async updateOwnName(userId: string, membershipId: string, name: string, version: number) {
    return this.transaction.runInTransaction(async (tx) => {
      const membership = await tx.membership.findUnique({
        where: { id: membershipId },
        select: { id: true, userId: true, organizationId: true, name: true, version: true },
      });
      if (!membership || membership.userId !== userId) {
        throw new AppException(ERROR_CODES.NOT_FOUND, [], 'Membership not found.');
      }
      if (membership.version !== version) {
        throw new AppException(ERROR_CODES.STALE_VERSION, [{ field: 'version', code: 'STALE_VERSION', message: `This member changed since you opened it (it is now version ${membership.version}). Reload and try again.` }], 'Stale version.');
      }
      const before = { name: membership.name };
      const updated = await tx.membership.update({
        where: { id: membershipId, version },
        data: { name, version: { increment: 1 } },
        select: { id: true, name: true, version: true },
      });
      await tx.auditLog.create({
        data: {
          organization: { connect: { id: membership.organizationId } },
          user: { connect: { id: userId } },
          action: AUDIT_ACTIONS.membersNameChanged,
          recordType: 'membership',
          recordId: membershipId,
          before,
          after: { name },
        },
      });
      return updated;
    });
  }

  /**
   * Switches the active organization for the user's session (FR-005).
   * Refuses if the user is not a member of the target organization.
   */
  async switchOrganization(
    userId: string,
    membershipId: string,
    targetOrganizationId: string,
  ) {
    const membership = await this.prisma.membership.findUnique({
      where: { id: membershipId },
    });

    if (!membership || membership.userId !== userId) {
      throw new NotFoundException('Membership not found.');
    }

    const targetMembership = await this.prisma.membership.findFirst({
      where: {
        userId,
        organizationId: targetOrganizationId,
        isActive: true,
      },
    });

    if (!targetMembership) {
      throw new ForbiddenException('Not a member of the target organization.');
    }

    // Resolve target membership roles
    const targetRoles = await this.prisma.membershipRole.findMany({
      where: { membershipId: targetMembership.id },
      include: { role: true },
    });

    // Update the session to point to the new membership
    await this.prisma.session.updateMany({
      where: { userId },
      data: { membershipId: targetMembership.id },
    });

    extendRequestContext({
      organizationId: targetOrganizationId,
    });

    return {
      membership: {
        id: targetMembership.id,
        roles: targetRoles.map((mr) => ({
          id: mr.role.id,
          key: mr.role.key,
          name: mr.role.name,
        })),
      },
      organization: {
        id: targetMembership.organizationId,
        name: targetOrganizationId,
      },
    };
  }

  /**
   * Returns all organizations the user is a member of, for the organization
   * switcher in the top bar.
   */
  async getOrganizations(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId, isActive: true },
      include: { organization: true },
      orderBy: { createdAt: 'asc' },
    });

    // Promise.all, not a bare `map(async ...)`: the bare map returns an array of
    // PROMISES, which JSON-serializes to `[{}, {}]` - every entry an empty object.
    return Promise.all(
      memberships.map(async (membership) => {
        const roles = await this.prisma.membershipRole.findMany({
          where: { membershipId: membership.id },
          select: { role: { select: { id: true, key: true, name: true } } },
        });
        return {
          id: membership.organization.id,
          name: membership.organization.name,
          // The currency this organization's prices are in, so the interface can
          // show it beside them.
          currencyCode: membership.organization.currencyCode,
          // The default due date of an operational invoice, read-only.
          defaultPaymentTermsDays: membership.organization.defaultPaymentTermsDays,
          roles: roles.map((r) => r.role),
        };
      }),
    );
  }

  /**
   * Invalidates all sessions for a membership (FR-008: password change,
   * membership deactivation).
   */
  async invalidateSessionsForMembership(membershipId: string) {
    await this.prisma.session.deleteMany({
      where: { membershipId },
    });
  }

  /**
   * Invalidates all sessions of a user across all organizations except the
   * given session id (used on successful password change, FR-027).
   */
  async invalidateAllSessionsExcept(userId: string, keepSessionId: string) {
    await this.prisma.session.deleteMany({
      where: { userId, id: { not: keepSessionId } },
    });
  }

  /**
   * Changes the authenticated user's own password (FR-025, FR-026, FR-027, FR-029).
   * Verifies the current password, validates the new password, rotates the current
   * session, invalidates all other sessions in every organization, and clears the
   * forced-change flag. All inside one transaction.
   */
  async changeOwnPassword(params: {
    userId: string;
    currentPassword: string;
    newPassword: string;
    sessionId: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: params.userId },
        select: { id: true, email: true, passwordHash: true },
      });

      if (!user) {
        throw new AppException(ERROR_CODES.NOT_FOUND, [], 'User not found.');
      }

      // 1. Verify current password (wrong → 400 INVALID_CURRENT_PASSWORD, never 401)
      const isValid = await argon2Verify(user.passwordHash, params.currentPassword);
      if (!isValid) {
        await this.recordFailedVerification(user.email);
        await this.checkFailedVerificationLimit(user.email);
        throw new AppException(ERROR_CODES.INVALID_CURRENT_PASSWORD, [], 'The current password is incorrect.');
      }

      // 2. Validate new password: differs from current, not the email
      if (params.newPassword === params.currentPassword) {
        throw new AppException(
          ERROR_CODES.VALIDATION_ERROR,
          [{ field: 'newPassword', code: 'VALIDATION_ERROR', message: 'New password must differ from the current password.' }],
        );
      }
      if (params.newPassword.toLowerCase() === user.email.toLowerCase()) {
        throw new AppException(
          ERROR_CODES.VALIDATION_ERROR,
          [{ field: 'newPassword', code: 'VALIDATION_ERROR', message: 'New password must not equal your email address.' }],
        );
      }

      // 3. Update hash, clear flag
      const passwordHash = await argon2Hash(params.newPassword);
      await tx.user.update({
        where: { id: params.userId },
        data: { passwordHash, mustChangePassword: false },
      });

      // 4. Identify the CURRENT session by its token hash.
      //    The cookie carries the raw token, not the row id, so looking the session
      //    up by `id` finds nothing - and the rotation then tries to write an EMPTY
      //    membership id into a uuid column, which the database rejects with an
      //    error that names nothing useful.
      const currentTokenHash = createHash('sha256').update(params.sessionId).digest('hex');
      const currentSession = await tx.session.findUnique({
        where: { tokenHash: currentTokenHash },
        select: { id: true, membershipId: true },
      });

      if (!currentSession) {
        throw new AppException(ERROR_CODES.UNAUTHENTICATED, [], 'No session to rotate.');
      }

      // 5. Invalidate all other sessions in every organization (the current one is
      //    rotated below, not merely kept).
      await tx.session.deleteMany({
        where: { userId: params.userId, id: { not: currentSession.id } },
      });

      // 6. Rotate the current session: delete + recreate with a fresh token
      await tx.session.delete({
        where: { id: currentSession.id },
      });
      const { rawToken } = await this.createSession(tx, params.userId, currentSession.membershipId);

      // 7. Audit: auth.password_changed
      await tx.auditLog.create({
        data: {
          user: { connect: { id: params.userId } },
          action: AUDIT_ACTIONS.authPasswordChanged,
          recordType: 'user',
          recordId: params.userId,
          after: { passwordChanged: true },
        },
      });

      return { rawToken };
    });
  }

  /**
   * Verifies the current password for change-password flows.
   * Throws 400 INVALID_CURRENT_PASSWORD (never 401) on wrong password.
   * Throws 429 with Retry-After when the rate limit is exceeded.
   */
  async verifyCurrentPassword(params: {
    userId: string;
    currentPassword: string;
  }): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: params.userId },
      select: { id: true, email: true, passwordHash: true },
    });

    if (!user) {
      throw new AppException(ERROR_CODES.NOT_FOUND, [], 'User not found.');
    }

    const isValid = await argon2Verify(user.passwordHash, params.currentPassword);
    if (!isValid) {
      await this.recordFailedVerification(user.email);
      await this.checkFailedVerificationLimit(user.email);
      throw new AppException(ERROR_CODES.INVALID_CURRENT_PASSWORD, [], 'The current password is incorrect.');
    }
  }

  // -----------------------------------------------------------------------
  // Failed-verification limiter (keyed by user email as a stable user id)
  // -----------------------------------------------------------------------

  /** The failed-verification window in milliseconds (15 minutes). */
  private static readonly FAILURE_WINDOW_MS = 15 * 60 * 1000;
  /** Max failures per window before 429. */
  private static readonly MAX_FAILURES = 5;

  /**
   * Records a failed verification attempt for the given email.
   * Callers should invoke this on every wrong current-password verification.
   */
  async recordFailedVerification(email: string): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        email,
        clientAddress: '',
        succeeded: false,
      },
    });
  }

  /**
   * Checks whether the given email has exceeded the failed-verification limit.
   * Throws 429 with Retry-After if more than MAX_FAILURES failures occurred
   * within FAILURE_WINDOW_MS.
   *
   * The count INCLUDES the failure that was just recorded, so the threshold is
   * "more than": five wrong verifications are answered with the specific
   * reason (400 INVALID_CURRENT_PASSWORD), and the SIXTH is refused with 429
   * (FR-025, SC-012). A limiter that refused the fifth would answer a
   * different question than the one it was asked.
   */
  async checkFailedVerificationLimit(email: string): Promise<void> {
    const windowStartMs = Date.now() - AuthService.FAILURE_WINDOW_MS;
    const windowStart = new Date(windowStartMs);

    const failureCount = await this.prisma.loginAttempt.count({
      where: {
        email,
        succeeded: false,
        createdAt: { gte: windowStart },
      },
    });

    if (failureCount > AuthService.MAX_FAILURES) {
      // Audit: lockout event (FR-015, FR-030)
      const lockedUser = await this.prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      await this.audit.loginFailure({
        userId: lockedUser?.id,
        reasonCode: 'lockout',
        isLockout: true,
      });

      // Find the earliest failure in the window to compute Retry-After.
      const oldest = await this.prisma.loginAttempt.findFirst({
        where: {
          email,
          succeeded: false,
          createdAt: { gte: windowStart },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });

      const retryAfterSeconds = oldest
        ? Math.ceil(
            (oldest.createdAt.getTime() + AuthService.FAILURE_WINDOW_MS -
              Date.now()) /
              1000,
          )
        : AuthService.FAILURE_WINDOW_MS / 1000;

      const waitSeconds = Math.max(1, retryAfterSeconds);

      throw new AppException(
        ERROR_CODES.TOO_MANY_REQUESTS,
        [],
        `Too many failed verifications. Please try again in ${waitSeconds} seconds.`,
        // The filter turns this into the Retry-After header.
        waitSeconds,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Password hashing helpers (argon2id)
  // -----------------------------------------------------------------------

  private async hashPassword(password: string): Promise<string> {
    return argon2Hash(password);
  }

  private async verifyPassword(hash: string, password: string): Promise<boolean> {
    return argon2Verify(hash, password);
  }

  /**
   * Creates a server-side session record with an opaque token.
   * Returns the session id and the raw token (for the cookie).
   */
  private async createSession(
    tx: TransactionClient,
    userId: string,
    membershipId: string,
  ): Promise<{ sessionId: string; rawToken: string }> {
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12h absolute

    const session = await tx.session.create({
      data: {
        tokenHash,
        userId,
        membershipId,
        expiresAt,
        createdAt: now,
        lastUsedAt: now,
      },
    });

    return { sessionId: session.id, rawToken };
  }

  /** Generates a CSRF token (not stored; validated on state-changing requests). */
  private generateCsrfToken(): string {
    return randomBytes(32).toString('hex');
  }
}

async function argon2VerifyDummy(password: string): Promise<boolean> {
  // Hash a dummy password so the timing profile matches a real verification,
  // preventing timing attacks that reveal whether the email exists.
  const dummy = await argon2Hash(password);
  return argon2Verify(dummy, 'wrong-password-xyz');
}
