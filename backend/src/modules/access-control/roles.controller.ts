import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation-pipe';
import { roleSchema, type RoleDto } from './dto/roles.dto';
import { RolesService } from './roles.service';
import { SessionGuard, SessionRequest } from '../../modules/auth/guards/session.guard';
import { getRequestContext } from '../../common/logging/request-context';

/**
 * Roles and permissions endpoints. All require `roles.manage` (FR-011).
 * Role addressing is org-scoped: a role of another organization → 404 (FR-022).
 * System roles are read-only (FR-013).
 */
@Controller('roles')
@UseGuards(SessionGuard)
export class RolesController {
  constructor(private readonly service: RolesService) {}

  /** List the active organization's roles with their permission codes. */
  @Get()
  @RequirePermission('roles.manage')
  async listRoles() {
    const ctx = getRequestContext();
    return this.service.listRoles(ctx?.organizationId ?? '');
  }

  /** List the system permission catalogue. */
  @Get('permissions')
  @RequirePermission('roles.manage')
  async listPermissions() {
    return this.service.listPermissions();
  }

  /** Create a custom role. Open catalogue, subject to no-escalation (FR-031). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('roles.manage')
  async createRole(
    @Req() request: SessionRequest,
    @Body(new ZodValidationPipe(roleSchema)) body: RoleDto,
  ) {
    const ctx = getRequestContext();
    return this.service.createRole({
      organizationId: ctx?.organizationId ?? '',
      name: body.name,
      key: body.key,
      description: body.description,
      permissionCodes: body.permissionCodes,
      actingUserId: request.userId ?? '',
      actingEffectivePermissions: [],
    });
  }

  /** Update a custom role's name and permission set (full replace). */
  @Put(':id')
  @RequirePermission('roles.manage')
  async updateRole(
    @Req() request: SessionRequest,
    @Param('id') roleId: string,
    @Body(new ZodValidationPipe(roleSchema)) body: RoleDto,
  ) {
    const ctx = getRequestContext();
    return this.service.updateRole({
      roleId,
      organizationId: ctx?.organizationId ?? '',
      name: body.name,
      key: body.key,
      description: body.description,
      permissionCodes: body.permissionCodes,
      actingUserId: request.userId ?? '',
      actingEffectivePermissions: [],
    });
  }

  /** Delete a custom role. System roles and assigned roles are protected. */
  @Delete(':id')
  @RequirePermission('roles.manage')
  async deleteRole(
    @Req() request: SessionRequest,
    @Param('id') roleId: string,
  ) {
    const ctx = getRequestContext();
    return this.service.deleteRole({
      roleId,
      organizationId: ctx?.organizationId ?? '',
      actingUserId: request.userId ?? '',
    });
  }
}
