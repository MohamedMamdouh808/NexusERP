import { type CustomDecorator } from '@nestjs/common';

import { REQUIRE_MODULE_KEY, RequireModule } from './require-module.decorator';

export const SALES_MODULE_KEY = REQUIRE_MODULE_KEY;
export const SalesModule = (): CustomDecorator<string> => RequireModule('sales');
