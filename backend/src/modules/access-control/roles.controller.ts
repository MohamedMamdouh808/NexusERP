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
import { AppException } from '../../common/errors/all-exceptions.filter';
import { ERROR_CODES } from '@nexuserp/shared';
import { RolesService } from './roles.service';
import { AccessControlService } from './access-control.service';
import { SessionGuard, SessionRequest } from '../../modules/auth/guards/session.guard';
import {
  requireOrganizationId,
  requireUserId,
} from '../../common/logging/request-context';

/**
 * Roles and permissions endpoints. All require `roles.manage` (FR-011).
 * Role addressing is org-scoped: a role of another organization → 404 (FR-022).
 * System roles are read-only (FR-013).
 */
@Controller('roles')
@UseGuards(SessionGuard)
export class RolesController {
  constructor(
    private readonly service: RolesService,
    private readonly accessControl: AccessControlService,
  ) {}

  /** List the active organization's roles with their permission codes. */
  @Get()
  @RequirePermission('roles.manage')
  async listRoles() {
    return this.service.listRoles(requireOrganizationId());
  }

  /** List the system permission catalogue. */
  @Get('permissions')
  @RequirePermission('roles.manage')
  async listPermissions() {
    return this.service.listPermissions();
  }

  /** Get a single role with its permissions and member count. */
  @Get(':id')
  @RequirePermission('roles.manage')
  async getRole(@Param('id') roleId: string) {
    const result = await this.service.getRole(requireOrganizationId(), roleId);
    if (!result) {
      throw new AppException(ERROR_CODES.NOT_FOUND, [], 'Role not found.');
    }
    return result;
  }

  /** Create a custom role. Open catalogue, subject to no-escalation (FR-031). */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('roles.manage')
  async createRole(
    @Req() request: SessionRequest,
    @Body(new ZodValidationPipe(roleSchema)) body: RoleDto,
  ) {
    // The actor's own effective permissions decide the no-escalation rule
    // (FR-031): a role may never grant more than the actor already holds.
    const actingEffectivePermissions = await this.accessControl.getEffectivePermissions(
      request.membershipId ?? '',
    );
    return this.service.createRole({
      organizationId: requireOrganizationId(),
      name: body.name,
      key: body.key,
      description: body.description,
      permissionCodes: body.permissionCodes,
      actingUserId: requireUserId(),
      actingEffectivePermissions,
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
    const actingEffectivePermissions = await this.accessControl.getEffectivePermissions(
      request.membershipId ?? '',
    );
    return this.service.updateRole({
      roleId,
      organizationId: requireOrganizationId(),
      name: body.name,
      key: body.key,
      description: body.description,
      permissionCodes: body.permissionCodes,
      actingUserId: requireUserId(),
      actingEffectivePermissions,
    });
  }

  /** Delete a custom role. System roles and assigned roles are protected. */
  @Delete(':id')
  @RequirePermission('roles.manage')
  async deleteRole(
    @Param('id') roleId: string,
  ) {
    return this.service.deleteRole({
      roleId,
      organizationId: requireOrganizationId(),
      actingUserId: requireUserId(),
    });
  }
}
