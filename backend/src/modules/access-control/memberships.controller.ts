import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation-pipe';
import {
  createMemberSchema,
  type CreateMemberDto,
} from './dto/memberships.dto';
import { replaceRolesSchema, type ReplaceRolesDto } from './dto/memberships.dto';
import { MembershipsService } from './memberships.service';
import { AccessControlService } from './access-control.service';
import { SessionGuard, SessionRequest } from '../../modules/auth/guards/session.guard';
import {
  requireOrganizationId,
  requireUserId,
} from '../../common/logging/request-context';

/**
 * Member management endpoints. All require `users.manage` (FR-005).
 * Cross-organization record addressing returns 404 (FR-022).
 */
@Controller('memberships')
@UseGuards(SessionGuard)
export class MembershipsController {
  constructor(
    private readonly service: MembershipsService,
    private readonly accessControl: AccessControlService,
  ) {}

  /** List the active organization's memberships with their roles. */
  @Get()
  @RequirePermission('users.manage')
  async list() {
    return this.service.list(requireOrganizationId());
  }

  /**
   * Create a member with an admin-supplied initial password and roles.
   * Not enumerable: identical answer whether the account is new or existing (FR-008).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('users.manage')
  async create(
    @Body(new ZodValidationPipe(createMemberSchema)) body: CreateMemberDto,
  ) {
    return this.service.createMember({
      organizationId: requireOrganizationId(),
      email: body.email,
      name: body.name,
      password: body.password,
      roleIds: body.roleIds,
      actingUserId: requireUserId(),
    });
  }

  /**
   * Replace a membership's roles atomically with a before/after audit entry.
   *
   * The status is 200, not 201: a POST that changes an existing membership
   * creates nothing, and "201 Created" would claim otherwise.
   */
  @Post(':id/roles')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users.manage')
  async replaceRoles(
    @Req() request: SessionRequest,
    @Param('id', ParseUUIDPipe) membershipId: string,
    @Body(new ZodValidationPipe(replaceRolesSchema)) body: ReplaceRolesDto,
  ) {
    const actorPermissions = await this.accessControl.getEffectivePermissions(
      request.membershipId ?? '',
    );
    return this.service.replaceRoles({
      membershipId,
      organizationId: requireOrganizationId(),
      roleIds: body.roleIds,
      actingUserId: requireUserId(),
      actingEffectivePermissions: actorPermissions,
    });
  }

  /**
   * Deactivate a membership. Invalidates the user's sessions for this organization.
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users.manage')
  async deactivate(
    @Param('id', ParseUUIDPipe) membershipId: string,
  ) {
    return this.service.deactivate({
      membershipId,
      organizationId: requireOrganizationId(),
      actingUserId: requireUserId(),
    });
  }

  /**
   * Reactivate a deactivated membership.
   */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users.manage')
  async reactivate(
    @Param('id', ParseUUIDPipe) membershipId: string,
  ) {
    return this.service.reactivate({
      membershipId,
      organizationId: requireOrganizationId(),
      actingUserId: requireUserId(),
    });
  }
}
