import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CONTACT_LIST_DEFAULTS,
  CONTACT_ROLE_FILTERS,
  CONTACT_SORT_FIELDS,
  CONTACT_SORT_ORDERS,
  CONTACT_STATUS_FILTERS,
  type ContactRoleFilter,
  type ContactSortField,
  type ContactSortOrder,
  type ContactStatusFilter,
} from '@nexuserp/shared';

/**
 * The query a contact list accepts.
 *
 * The allowed values are the shared ones, so the interface and the service
 * cannot drift apart: a filter the service would reject is a filter the
 * interface must not offer.
 */
export class ListContactsDto {
  @ApiPropertyOptional({ description: 'Search term across code, name, email, or phone' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Role filter',
    enum: CONTACT_ROLE_FILTERS,
    default: CONTACT_LIST_DEFAULTS.role,
  })
  @IsOptional()
  @IsIn(CONTACT_ROLE_FILTERS)
  role: ContactRoleFilter = CONTACT_LIST_DEFAULTS.role;

  @ApiPropertyOptional({
    description: 'Archival status filter',
    enum: CONTACT_STATUS_FILTERS,
    default: CONTACT_LIST_DEFAULTS.status,
  })
  @IsOptional()
  @IsIn(CONTACT_STATUS_FILTERS)
  status: ContactStatusFilter = CONTACT_LIST_DEFAULTS.status;

  @ApiPropertyOptional({ description: 'Page number', default: CONTACT_LIST_DEFAULTS.page, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = CONTACT_LIST_DEFAULTS.page;

  @ApiPropertyOptional({
    description: 'Page size',
    default: CONTACT_LIST_DEFAULTS.pageSize,
    minimum: 1,
    maximum: CONTACT_LIST_DEFAULTS.maxPageSize,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(CONTACT_LIST_DEFAULTS.maxPageSize)
  pageSize: number = CONTACT_LIST_DEFAULTS.pageSize;

  @ApiPropertyOptional({
    description: 'Sort column',
    enum: CONTACT_SORT_FIELDS,
    default: CONTACT_LIST_DEFAULTS.sortBy,
  })
  @IsOptional()
  @IsIn(CONTACT_SORT_FIELDS)
  sortBy: ContactSortField = CONTACT_LIST_DEFAULTS.sortBy;

  @ApiPropertyOptional({
    description: 'Sort direction',
    enum: CONTACT_SORT_ORDERS,
    default: CONTACT_LIST_DEFAULTS.sortOrder,
  })
  @IsOptional()
  @IsIn(CONTACT_SORT_ORDERS)
  sortOrder: ContactSortOrder = CONTACT_LIST_DEFAULTS.sortOrder;
}
