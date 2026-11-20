import { type CustomDecorator } from '@nestjs/common';

import { REQUIRE_MODULE_KEY, RequireModule } from './require-module.decorator';

export const INVOICING_MODULE_KEY = REQUIRE_MODULE_KEY;
export const InvoicingModule = (): CustomDecorator<string> => RequireModule('invoicing');
