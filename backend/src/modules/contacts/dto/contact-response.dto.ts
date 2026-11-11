import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ContactResponseDto {
  @ApiProperty({ description: 'Contact unique identifier (UUID)' })
  id!: string;

  @ApiProperty({ description: 'Organization identifier (UUID)' })
  organizationId!: string;

  @ApiProperty({ description: 'Auto-assigned human-readable sequence code (e.g., CUST-00001, SUPP-00001)' })
  code!: string;

  @ApiProperty({ description: 'Contact name' })
  name!: string;

  @ApiPropertyOptional({ description: 'Contact email' })
  email?: string | null;

  @ApiPropertyOptional({ description: 'Contact phone' })
  phone?: string | null;

  @ApiProperty({ description: 'Customer role flag' })
  isCustomer!: boolean;

  @ApiProperty({ description: 'Supplier role flag' })
  isSupplier!: boolean;

  @ApiPropertyOptional({ description: 'Address line 1' })
  addressLine1?: string | null;

  @ApiPropertyOptional({ description: 'Address line 2' })
  addressLine2?: string | null;

  @ApiPropertyOptional({ description: 'City' })
  city?: string | null;

  @ApiPropertyOptional({ description: 'Region or state' })
  region?: string | null;

  @ApiPropertyOptional({ description: 'Postal code' })
  postalCode?: string | null;

  @ApiPropertyOptional({ description: 'Country' })
  country?: string | null;

  @ApiProperty({ description: 'Archived flag' })
  isArchived!: boolean;

  @ApiProperty({ description: 'Optimistic locking version counter' })
  version!: number;

  @ApiProperty({ description: 'Record creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Record last updated timestamp' })
  updatedAt!: Date;
}
