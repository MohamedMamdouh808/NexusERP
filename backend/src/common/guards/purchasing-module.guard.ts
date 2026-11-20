import { type CustomDecorator } from '@nestjs/common';

import { REQUIRE_MODULE_KEY, RequireModule } from './require-module.decorator';

/**
 * Thin alias for the shared module gate (P0-F002 consolidation, A1).
 *
 * Every Purchasing endpoint declares `@PurchasingModule()`, which now expands to
 * `@RequireModule('purchasing')` so the shared `ModuleGuard` reads a single
 * metadata key. The guard class itself is gone: `ModuleGuard` is applied on the
 * controller and reads `REQUIRE_MODULE_KEY`.
 */
export const PURCHASING_MODULE_KEY = REQUIRE_MODULE_KEY;
export const PurchasingModule = (): CustomDecorator<string> =>
  RequireModule('purchasing');
