import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * The product as the interface receives it.
 *
 * The prices and the reorder level are decimal STRINGS. They are never numbers:
 * a JSON number is a double in every parser, and the interface performs no
 * arithmetic on money - it shows what was recorded.
 */
export class ProductResponseDto {
  @ApiProperty({ description: 'Product id' })
  id!: string;

  @ApiProperty({ description: 'Owning organization id' })
  organizationId!: string;

  @ApiProperty({ description: 'Stock keeping unit, unique within the organization' })
  sku!: string;

  @ApiProperty({ description: 'Product name' })
  name!: string;

  @ApiProperty({ description: 'Category id' })
  categoryId!: string;

  @ApiProperty({ description: 'Unit of measure id' })
  unitId!: string;

  @ApiProperty({ description: 'Purchase price as a decimal string with four places' })
  purchasePrice!: string;

  @ApiProperty({ description: 'Selling price as a decimal string with four places' })
  sellingPrice!: string;

  @ApiPropertyOptional({
    description: 'Reorder level (low-stock threshold) as a decimal string with three places',
    nullable: true,
  })
  lowStockThreshold!: string | null;

  @ApiProperty({ description: 'Whether the product is archived' })
  isArchived!: boolean;

  @ApiProperty({ description: 'Version, increased on every accepted change' })
  version!: number;

  @ApiProperty({ description: 'Creation timestamp' })
  createdAt!: Date;

  @ApiProperty({ description: 'Last change timestamp' })
  updatedAt!: Date;
}
