import { SetMetadata, type CustomDecorator } from '@nestjs/common';

/**
 * The single explicit declaration that a route requires NO permission.
 *
 * Constitution Principle II requires default deny: an endpoint without a declared
 * permission must fail. Silence is therefore not a decision, and a public route has to
 * SAY so.
 *
 * This feature declares exactly one public route - the health endpoint - and it uses this
 * marker. Every future endpoint requires `@RequirePermission(...)`; forgetting the
 * decorator leaves the route denied, which is the safe direction to fail.
 */
export const IS_PUBLIC_KEY = 'nexuserp:isPublic';
export const Public = (): CustomDecorator<string> => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Declares the permission a route requires.
 *
 * The code is a `resource.action` string from the shared catalog. Typing it against the
 * catalog rather than as a bare `string` means a route cannot declare a permission that
 * does not exist - the most common way a permission system rots is a typo in a decorator
 * that is then granted to nobody and enforced against everybody.
 */
export const REQUIRED_PERMISSION_KEY = 'nexuserp:requiredPermission';
export const RequirePermission = (permission: string): CustomDecorator<string> =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);