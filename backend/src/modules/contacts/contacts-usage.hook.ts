import { Injectable } from '@nestjs/common';

export interface UsageCheckResult {
  readonly inUse: boolean;
  readonly reason?: string;
}

export const CONTACTS_USAGE_HOOK = 'CONTACTS_USAGE_HOOK';

export interface ContactsUsageHook {
  isInUse(organizationId: string, contactId: string): Promise<UsageCheckResult>;
}

@Injectable()
export class DefaultContactsUsageHook implements ContactsUsageHook {
  /**
   * Default implementation for Phase 1. Returns not in use.
   * Future modules (Sales, Purchasing, Invoicing) will provide implementations
   * that query open purchase orders, open sales orders, and unpaid invoices.
   */
  isInUse(_organizationId: string, _contactId: string): Promise<UsageCheckResult> {
    return Promise.resolve({ inUse: false });
  }
}
