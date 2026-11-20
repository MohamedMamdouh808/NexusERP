import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { ModuleStateService } from './module-state.service';
import { OrganizationLockService } from './organization-lock.service';
import { OrganizationModulesService } from './organization-modules.service';

@Module({
  imports: [AuditModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    ModuleStateService,
    OrganizationLockService,
    OrganizationModulesService,
  ],
  exports: [
    OrganizationsService,
    ModuleStateService,
    OrganizationLockService,
    OrganizationModulesService,
  ],
})
export class OrganizationsModule {}
