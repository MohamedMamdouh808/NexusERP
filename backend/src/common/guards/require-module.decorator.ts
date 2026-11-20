import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/**
 * Declares that a route belongs to a switchable module.
 *
 * Every endpoint of Inventory, Purchasing, Sales, Invoicing and Reports carries
 * `@RequireModule('inventory')` (etc.). The shared `ModuleGuard` reads the key
 * once per request, looks the module up in `organization_modules`, and refuses
 * with 403 `MODULE_DISABLED` when the row is disabled - reads included.
 *
 * Default deny: an endpoint that reaches the guard without declaring a module
 * key is refused and the defect is logged, so a forgotten decorator fails closed.
 */
export const REQUIRE_MODULE_KEY = 'nexuserp:module';

export const RequireModule = (key: string): CustomDecorator<string> =>
  SetMetadata(REQUIRE_MODULE_KEY, key);
