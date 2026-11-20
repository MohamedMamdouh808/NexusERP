import { ApiProperty } from '@nestjs/swagger';

/**
 * The `/auth/me` response (P0-F002, Feature 018).
 *
 * Every field the session store reads, declared so the generated contract
 * documents the session payload the interface adapts to.
 */
export class MeResponseUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() mustChangePassword!: boolean;
}

export class MeResponseMembershipRoleDto {
  @ApiProperty() id!: string;
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
}

export class MeResponseMembershipDto {
  @ApiProperty() id!: string;
  @ApiProperty() version!: number;
  @ApiProperty({ type: [MeResponseMembershipRoleDto] }) roles!: MeResponseMembershipRoleDto[];
  @ApiProperty({ nullable: true }) name!: string | null;
  @ApiProperty() isActive!: boolean;
}

export class MeResponseOrganizationDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() currencyCode!: string;
  @ApiProperty() defaultPaymentTermsDays!: number;
  @ApiProperty({ type: [String] }) enabledModules!: string[];
}

export class MeResponseDto {
  @ApiProperty({ type: MeResponseUserDto }) user!: MeResponseUserDto;
  @ApiProperty({ type: MeResponseMembershipDto }) membership!: MeResponseMembershipDto;
  @ApiProperty({ type: MeResponseOrganizationDto }) organization!: MeResponseOrganizationDto;
  @ApiProperty({ type: [String] }) permissions!: string[];
}
