import { Module } from '@nestjs/common';

import { InventoryModule } from '../inventory/inventory.module';
import { ModuleGuard } from '../../common/guards/module.guard';
import { OrganizationsModule } from '../organizations/organizations.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [InventoryModule, OrganizationsModule],
  controllers: [ReportsController],
  providers: [ReportsService, ModuleGuard],
  exports: [ReportsService],
})
export class ReportsModule {}