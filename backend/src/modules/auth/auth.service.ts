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
  ) {}

  /**
   * Registers a new user with their first organization. All writes run in one
   * transaction: any failure creates nothing (FR-001, Constitution Principle III).
   * Default roles and permissions are already seeded globally; the membership
   * references the 'administrator' role key.
   */
  async register(email: string, password: string) {
    return this.transaction.runInTransaction(async (tx) => {
      // 1. Create user with Argon2id-hashed password (FR-009)
      const user = await tx.user.create({
        data: {
          email,
          passwordHash: await this.hashPassword(password),
        },
      });

      // 2. Create the first organization
      const organization = await tx.organization.create({
        data: { name: `${email}'s Organization` },
      });

      // 3. Create Administrator membership (references globally seeded role)
      const membership = await tx.membership.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          roleKey: 'administrator',
          isActive: true,
        },
      });

      // 4. Create default warehouse (FR-001)
      await tx.warehouse.create({
        data: {
          organizationId: organization.id,
          name: 'Default Warehouse',
          isDefault: true,
        },
      });

      // 5. Create default document sequence (FR-001)
      await tx.documentSequence.create({
        data: {
          organizationId: organization.id,
          name: 'invoice',
          currentValue: 0,
        },
      });

      // 6. Create session with 30-minute idle / 12-hour absolute expiry (FR-006, FR-007)
      const { sessionId, rawToken } = await this.createSession(tx, user.id, membership.id);

      // 7. Generate CSRF token per session (FR-011)
      const csrfToken = this.generateCsrfToken();

      // Extend request context with tenant scope (FR-013)
      extendRequestContext({
        organizationId: organization.id,
      });

      return {
        user: { id: user.id, email: user.email },
        organization: { id: organization.id, name: organization.name },
        membership: {
          id: membership.id,
          roleKey: membership.roleKey,
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

    // Create session
    const { sessionId, rawToken } = await this.createSession(this.prisma, user.id, membership.id);

    // Generate CSRF token
    const csrfToken = this.generateCsrfToken();

    extendRequestContext({
      organizationId: membership.organization.id,
    });

    return {
      user: { id: user.id, email: user.email },
      membership: {
        id: membership.id,
        roleKey: membership.roleKey,
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
      include: { organization: true, user: true },
    });

    if (!membership || membership.userId !== userId || !membership.isActive) {
      throw new NotFoundException('Membership not found or inactive.');
    }

    return {
      user: { id: membership.user.id, email: membership.user.email },
      membership: {
        id: membership.id,
        roleKey: membership.roleKey,
        isActive: membership.isActive,
      },
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
      },
    };
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
        roleKey: targetMembership.roleKey,
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

    return memberships.map((membership) => ({
      id: membership.organization.id,
      name: membership.organization.name,
      roleKey: membership.roleKey,
    }));
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

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  /**
   * Creates a session record with a hashed token. Returns the session id and
   * the raw token (for the cookie). The database only ever stores the hash,
   * so a database leak does not expose session tokens.
   */
  private async createSession(
    tx: TransactionClient,
    userId: string,
    membershipId: string,
  ): Promise<{ sessionId: string; rawToken: string }> {
    const rawToken = this.generateSessionToken();
    const session = await tx.session.create({
      data: {
        tokenHash: this.hashToken(rawToken),
        userId,
        membershipId,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000), // 12 hours absolute
      },
    });
    return { sessionId: session.id, rawToken };
  }

  private async hashPassword(password: string): Promise<string> {
    const argon2 = (await import('argon2')).default;
    return argon2.hash(password);
  }

  private async verifyPassword(hash: string, password: string): Promise<boolean> {
    const argon2 = (await import('argon2')).default;
    return argon2.verify(hash, password);
  }

  private generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private generateCsrfToken(): string {
    return randomBytes(16).toString('hex');
  }
}

async function argon2VerifyDummy(password: string): Promise<boolean> {
  const argon2 = (await import('argon2')).default;
  const dummyHash = await argon2.hash('dummy');
  return argon2.verify(dummyHash, password);
}
