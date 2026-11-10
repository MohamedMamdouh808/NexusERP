import { Module } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { MembershipsService } from './memberships.service';
import { MembershipsController } from './memberships.controller';
import { RolesService } from './roles.service';
import { RolesController } from './roles.controller';

@Module({
  providers: [AccessControlService, MembershipsService, RolesService],
  exports: [AccessControlService, MembershipsService, RolesService],
  controllers: [MembershipsController, RolesController],
})
export class AccessControlModule {}
