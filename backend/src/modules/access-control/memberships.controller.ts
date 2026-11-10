import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
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
import { getRequestContext } from '../../common/logging/request-context';

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
    const ctx = getRequestContext();
    return this.service.list(ctx?.organizationId ?? '');
  }

  /**
   * Create a member with an admin-supplied initial password and roles.
   * Not enumerable: identical answer whether the account is new or existing (FR-008).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission('users.manage')
  async create(
    @Req() request: SessionRequest,
    @Body(new ZodValidationPipe(createMemberSchema)) body: CreateMemberDto,
  ) {
    const ctx = getRequestContext();
    return this.service.createMember({
      organizationId: ctx?.organizationId ?? '',
      email: body.email,
      name: body.name,
      password: body.password,
      roleIds: body.roleIds,
      actingUserId: request.userId ?? '',
    });
  }

  /**
   * Replace a membership's roles atomically with a before/after audit entry.
   */
  @Post(':id/roles')
  @RequirePermission('users.manage')
  async replaceRoles(
    @Req() request: SessionRequest,
    @Param('id') membershipId: string,
    @Body(new ZodValidationPipe(replaceRolesSchema)) body: ReplaceRolesDto,
  ) {
    const ctx = getRequestContext();
    const actorPermissions = await this.accessControl.getEffectivePermissions(
      request.membershipId ?? '',
    );
    return this.service.replaceRoles({
      membershipId,
      organizationId: ctx?.organizationId ?? '',
      roleIds: body.roleIds,
      actingUserId: request.userId ?? '',
      actingEffectivePermissions: actorPermissions,
    });
  }

  /**
   * Deactivate a membership. Invalidates the user's sessions for this organization.
   */
  @Post(':id/deactivate')
  @RequirePermission('users.manage')
  async deactivate(
    @Req() request: SessionRequest,
    @Param('id') membershipId: string,
  ) {
    const ctx = getRequestContext();
    return this.service.deactivate({
      membershipId,
      organizationId: ctx?.organizationId ?? '',
      actingUserId: request.userId ?? '',
    });
  }

  /**
   * Reactivate a deactivated membership.
   */
  @Post(':id/reactivate')
  @RequirePermission('users.manage')
  async reactivate(
    @Req() request: SessionRequest,
    @Param('id') membershipId: string,
  ) {
    const ctx = getRequestContext();
    return this.service.reactivate({
      membershipId,
      organizationId: ctx?.organizationId ?? '',
      actingUserId: request.userId ?? '',
    });
  }
}
