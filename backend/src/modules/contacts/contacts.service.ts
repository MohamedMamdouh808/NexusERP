import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/prisma/prisma.service';
import { TransactionService, type TransactionClient } from '../../platform/transaction/transaction.service';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS, ERROR_CODES } from '@nexuserp/shared';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactsDto } from './dto/list-contacts.dto';
import { CONTACTS_USAGE_HOOK, type ContactsUsageHook } from './contacts-usage.hook';

/** Escapes ILIKE/LIKE special wildcards (`%`, `_`, `\`) for safe literal substring search. */
function escapeSqlWildcards(input: string): string {
  return input.replace(/([%_\\])/g, '\\$1');
}

/** The columns a caller may sort by. Anything else falls back to `name`. */
const SORTABLE_COLUMNS = ['name', 'code', 'createdAt'] as const;

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transaction: TransactionService,
    private readonly audit: AuditService,
    @Inject(CONTACTS_USAGE_HOOK)
    private readonly usageHook: ContactsUsageHook,
  ) {}

  /**
   * Creates a contact within an organization.
   * Auto-assigns a human-readable sequence code (CUST-00001 or SUPP-00001),
   * enforces unique case-insensitive email, and records an audit log atomically.
   */
  async create(organizationId: string, userId: string, dto: CreateContactDto) {
    const isCustomer = dto.isCustomer ?? false;
    const isSupplier = dto.isSupplier ?? false;

    if (!isCustomer && !isSupplier) {
      throw new AppException(
        ERROR_CODES.VALIDATION_ERROR,
        [{ field: 'role', code: 'REQUIRED', message: 'At least one role flag (isCustomer or isSupplier) must be true.' }],
        'At least one role flag must be selected.',
      );
    }

    const emailTrimmed = dto.email?.trim() || null;

    return this.transaction.runInTransaction(async (tx) => {
      // 1. Check duplicate email case-insensitively within this organization
      if (emailTrimmed) {
        const existing = await tx.contact.findFirst({
          where: {
            organizationId,
            email: { equals: emailTrimmed, mode: 'insensitive' },
          },
          select: { id: true, name: true },
        });

        if (existing) {
          throw new AppException(
            ERROR_CODES.DUPLICATE_RECORD,
            [{ field: 'email', code: 'DUPLICATE', message: `A contact with email "${emailTrimmed}" already exists: ${existing.name}` }],
            `A contact with this email already exists: ${existing.name}`,
          );
        }
      }

      // 2. Allocate sequence code atomically
      const sequenceName = isCustomer ? 'contact_customer' : 'contact_supplier';
      const prefix = isCustomer ? 'CUST' : 'SUPP';
      const code = await this.allocateSequenceCode(tx, organizationId, sequenceName, prefix);

      // 3. Persist contact
      const contact = await tx.contact.create({
        data: {
          organizationId,
          code,
          name: dto.name.trim(),
          email: emailTrimmed,
          phone: dto.phone?.trim() || null,
          isCustomer,
          isSupplier,
          addressLine1: dto.addressLine1?.trim() || null,
          addressLine2: dto.addressLine2?.trim() || null,
          city: dto.city?.trim() || null,
          region: dto.region?.trim() || null,
          postalCode: dto.postalCode?.trim() || null,
          country: dto.country?.trim() || null,
          isArchived: false,
          version: 1,
        },
      });

      // 4. Record audit log
      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.contactsCreated,
        recordType: 'contact',
        recordId: contact.id,
        before: null,
        after: {
          code: contact.code,
          name: contact.name,
          email: contact.email,
          phone: contact.phone,
          isCustomer: contact.isCustomer,
          isSupplier: contact.isSupplier,
          addressLine1: contact.addressLine1,
          city: contact.city,
          country: contact.country,
        },
      });

      return contact;
    });
  }

  /**
   * Retrieves a contact by ID strictly within the active organization.
   * Returns 404 for cross-tenant or nonexistent records.
   */
  async findById(organizationId: string, id: string) {
    const contact = await this.prisma.contact.findUnique({
      where: {
        organizationId_id: {
          organizationId,
          id,
        },
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found.');
    }

    return contact;
  }

  /**
   * Lists contacts with search (wildcards escaped), filtering, sorting, and pagination.
   */
  async list(organizationId: string, dto: ListContactsDto) {
    const where: Prisma.ContactWhereInput = {
      organizationId,
    };

    // Status filter
    if (dto.status === 'active') {
      where.isArchived = false;
    } else if (dto.status === 'archived') {
      where.isArchived = true;
    }

    // Role filter
    if (dto.role === 'customer') {
      where.isCustomer = true;
    } else if (dto.role === 'supplier') {
      where.isSupplier = true;
    }

    // Search filter across code, name, email, phone
    const searchTrimmed = dto.search?.trim();
    if (searchTrimmed) {
      const sanitized = escapeSqlWildcards(searchTrimmed);
      where.OR = [
        { code: { contains: sanitized, mode: 'insensitive' } },
        { name: { contains: sanitized, mode: 'insensitive' } },
        { email: { contains: sanitized, mode: 'insensitive' } },
        { phone: { contains: sanitized, mode: 'insensitive' } },
      ];
    }

    // Pagination and sorting are read defensively: the query parameters are
    // optional, and a missing or malformed one must never reach the database as
    // NaN or as an unknown column.
    const page = Math.max(1, Number(dto.page ?? 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(dto.pageSize ?? 25) || 25));
    const skip = (page - 1) * pageSize;

    const sortBy = SORTABLE_COLUMNS.includes(dto.sortBy) ? dto.sortBy : 'name';
    const sortOrder = dto.sortOrder === 'desc' ? 'desc' : 'asc';

    const orderBy: Prisma.ContactOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Updates a contact with optimistic concurrency locking.
   * If version does not match, rejects with 409 STALE_VERSION.
   */
  async update(organizationId: string, userId: string, id: string, dto: UpdateContactDto) {
    return this.transaction.runInTransaction(async (tx) => {
      // 1. Fetch current record
      const existing = await tx.contact.findUnique({
        where: {
          organizationId_id: {
            organizationId,
            id,
          },
        },
      });

      if (!existing) {
        throw new NotFoundException('Contact not found.');
      }

      // 2. Check optimistic concurrency version
      if (existing.version !== dto.version) {
        throw new AppException(
          ERROR_CODES.STALE_VERSION,
          [{ field: 'version', code: 'STALE', message: 'The contact was modified by another user. Please reload the latest data.' }],
          'The contact has been modified since it was loaded. Please reload and try again.',
        );
      }

      // 3. Check duplicate email if email is being changed
      const emailTrimmed = dto.email !== undefined ? (dto.email?.trim() || null) : existing.email;
      if (emailTrimmed && emailTrimmed.toLowerCase() !== existing.email?.toLowerCase()) {
        const duplicate = await tx.contact.findFirst({
          where: {
            organizationId,
            id: { not: id },
            email: { equals: emailTrimmed, mode: 'insensitive' },
          },
          select: { id: true, name: true },
        });

        if (duplicate) {
          throw new AppException(
            ERROR_CODES.DUPLICATE_RECORD,
            [{ field: 'email', code: 'DUPLICATE', message: `A contact with email "${emailTrimmed}" already exists: ${duplicate.name}` }],
            `A contact with this email already exists: ${duplicate.name}`,
          );
        }
      }

      const isCustomer = dto.isCustomer !== undefined ? dto.isCustomer : existing.isCustomer;
      const isSupplier = dto.isSupplier !== undefined ? dto.isSupplier : existing.isSupplier;

      if (!isCustomer && !isSupplier) {
        throw new AppException(
          ERROR_CODES.VALIDATION_ERROR,
          [{ field: 'role', code: 'REQUIRED', message: 'At least one role flag (isCustomer or isSupplier) must be true.' }],
          'At least one role flag must be selected.',
        );
      }

      // 4. Update contact with incremented version
      const updated = await tx.contact.update({
        where: {
          organizationId_id: {
            organizationId,
            id,
          },
        },
        data: {
          name: dto.name !== undefined ? dto.name.trim() : existing.name,
          email: emailTrimmed,
          phone: dto.phone !== undefined ? (dto.phone?.trim() || null) : existing.phone,
          isCustomer,
          isSupplier,
          addressLine1: dto.addressLine1 !== undefined ? (dto.addressLine1?.trim() || null) : existing.addressLine1,
          addressLine2: dto.addressLine2 !== undefined ? (dto.addressLine2?.trim() || null) : existing.addressLine2,
          city: dto.city !== undefined ? (dto.city?.trim() || null) : existing.city,
          region: dto.region !== undefined ? (dto.region?.trim() || null) : existing.region,
          postalCode: dto.postalCode !== undefined ? (dto.postalCode?.trim() || null) : existing.postalCode,
          country: dto.country !== undefined ? (dto.country?.trim() || null) : existing.country,
          version: { increment: 1 },
        },
      });

      // 5. Record audit log
      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.contactsUpdated,
        recordType: 'contact',
        recordId: updated.id,
        before: {
          name: existing.name,
          email: existing.email,
          phone: existing.phone,
          isCustomer: existing.isCustomer,
          isSupplier: existing.isSupplier,
          version: existing.version,
        },
        after: {
          name: updated.name,
          email: updated.email,
          phone: updated.phone,
          isCustomer: updated.isCustomer,
          isSupplier: updated.isSupplier,
          version: updated.version,
        },
      });

      return updated;
    });
  }

  /**
   * Archives a contact if not currently in use by active documents.
   */
  async archive(organizationId: string, userId: string, id: string) {
    return this.transaction.runInTransaction(async (tx) => {
      const contact = await tx.contact.findUnique({
        where: {
          organizationId_id: {
            organizationId,
            id,
          },
        },
      });

      if (!contact) {
        throw new NotFoundException('Contact not found.');
      }

      if (contact.isArchived) {
        return contact;
      }

      // Check usage hook
      const usage = await this.usageHook.isInUse(organizationId, id);
      if (usage.inUse) {
        throw new AppException(
          ERROR_CODES.CONTACT_IN_USE,
          [{ field: 'id', code: 'IN_USE', message: usage.reason || 'Cannot archive contact because active documents reference it.' }],
          usage.reason || 'Cannot archive contact because active documents reference it.',
        );
      }

      const updated = await tx.contact.update({
        where: {
          organizationId_id: {
            organizationId,
            id,
          },
        },
        data: {
          isArchived: true,
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.contactsArchived,
        recordType: 'contact',
        recordId: contact.id,
        before: { isArchived: false, version: contact.version },
        after: { isArchived: true, version: updated.version },
      });

      return updated;
    });
  }

  /**
   * Restores an archived contact back to active.
   */
  async restore(organizationId: string, userId: string, id: string) {
    return this.transaction.runInTransaction(async (tx) => {
      const contact = await tx.contact.findUnique({
        where: {
          organizationId_id: {
            organizationId,
            id,
          },
        },
      });

      if (!contact) {
        throw new NotFoundException('Contact not found.');
      }

      if (!contact.isArchived) {
        return contact;
      }

      const updated = await tx.contact.update({
        where: {
          organizationId_id: {
            organizationId,
            id,
          },
        },
        data: {
          isArchived: false,
          version: { increment: 1 },
        },
      });

      await this.audit.record({
        organizationId,
        userId,
        action: AUDIT_ACTIONS.contactsRestored,
        recordType: 'contact',
        recordId: contact.id,
        before: { isArchived: true, version: contact.version },
        after: { isArchived: false, version: updated.version },
      });

      return updated;
    });
  }

  /**
   * Helper to allocate and format document sequence codes atomically.
   */
  private async allocateSequenceCode(
    tx: TransactionClient,
    organizationId: string,
    sequenceName: string,
    prefix: string,
  ): Promise<string> {
    const sequence = await tx.documentSequence.upsert({
      where: {
        id: (await tx.documentSequence.findFirst({
          where: { organizationId, name: sequenceName },
          select: { id: true },
        }))?.id ?? '00000000-0000-0000-0000-000000000000',
      },
      update: {
        currentValue: { increment: 1 },
      },
      create: {
        organizationId,
        name: sequenceName,
        currentValue: 1,
      },
    });

    const paddedNumber = String(sequence.currentValue).padStart(5, '0');
    return `${prefix}-${paddedNumber}`;
  }
}
