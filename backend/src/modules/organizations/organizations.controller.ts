import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { Authenticated, RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation-pipe';
import { requireOrganizationId, requireUserId } from '../../common/logging/request-context';
import { OrganizationsService } from './organizations.service';
import { OrganizationModulesService } from './organization-modules.service';
import {
  updateOrganizationSettingsSchema,
  type UpdateOrganizationSettingsInput,
} from './dto/organization-settings.dto';
import { toggleModuleSchema, type ToggleModuleInput } from './dto/toggle-module.dto';

/**
 * Organization settings endpoints (P0-F002, Feature 018).
 *
 * Reads require a session; writes require `settings.manage`. Tenant scope always
 * comes from the session context - a client cannot name another organization.
 */
@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(
    private readonly service: OrganizationsService,
    private readonly modules: OrganizationModulesService,
  ) {}

  @Get('current')
  @Authenticated()
  @ApiOperation({ summary: 'Read the current organization settings and module list' })
  @ApiResponse({ status: 200, description: 'Settings, version, currency lock and modules' })
  async getCurrent() {
    return this.service.getCurrentSettings(requireOrganizationId());
  }

  @Put('current')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Update organization name, currency and payment terms' })
  @ApiResponse({ status: 200, description: 'The updated settings with a new version' })
  @ApiResponse({ status: 409, description: 'STALE_VERSION or CURRENCY_LOCKED' })
  async updateCurrent(
    @Body(new ZodValidationPipe(updateOrganizationSettingsSchema))
    body: UpdateOrganizationSettingsInput,
  ) {
    return this.service.updateSettings(
      requireOrganizationId(),
      requireUserId(),
      body,
    );
  }

  @Get('current/modules')
  @Authenticated()
  @ApiOperation({ summary: 'List module availability for the current organization' })
  @ApiResponse({ status: 200, description: 'Switchable and always-on modules' })
  async listModules() {
    return this.modules.listModules(requireOrganizationId());
  }

  @Put('current/modules/:key')
  @RequirePermission('settings.manage')
  @ApiOperation({ summary: 'Switch a module on or off' })
  @ApiParam({ name: 'key', description: 'A switchable module key' })
  @ApiResponse({ status: 200, description: 'The new module state and version' })
  @ApiResponse({ status: 409, description: 'STALE_VERSION, MODULE_DEPENDENCY or MODULE_IN_USE' })
  async toggleModule(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(toggleModuleSchema)) body: ToggleModuleInput,
  ) {
    return this.modules.toggleModule(requireOrganizationId(), requireUserId(), key, body);
  }
}
