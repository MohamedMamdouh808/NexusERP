import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactsDto } from './dto/list-contacts.dto';
import { ContactResponseDto } from './dto/contact-response.dto';
import { SessionGuard } from '../auth/guards/session.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { requireOrganizationId, requireUserId } from '../../common/logging/request-context';

@ApiTags('Contacts')
@Controller('contacts')
@UseGuards(SessionGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  @RequirePermission('contacts.write')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new customer or supplier contact' })
  @ApiResponse({ status: 201, description: 'Contact successfully created', type: ContactResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error (e.g. missing role)' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires contacts.write)' })
  @ApiResponse({ status: 409, description: 'Duplicate contact email within organization' })
  async create(@Body() dto: CreateContactDto): Promise<ContactResponseDto> {
    return this.contactsService.create(requireOrganizationId(), requireUserId(), dto);
  }

  @Get()
  @RequirePermission('contacts.read')
  @ApiOperation({ summary: 'List contacts with search, filters, sorting, and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated list of contacts' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires contacts.read)' })
  async list(@Query() query: ListContactsDto) {
    return this.contactsService.list(requireOrganizationId(), query);
  }

  @Get(':id')
  @RequirePermission('contacts.read')
  @ApiOperation({ summary: 'Get a contact by ID' })
  @ApiParam({ name: 'id', description: 'Contact UUID' })
  @ApiResponse({ status: 200, description: 'Contact details', type: ContactResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden (requires contacts.read)' })
  @ApiResponse({ status: 404, description: 'Contact not found or cross-tenant' })
  async findById(@Param('id', ParseUUIDPipe) id: string): Promise<ContactResponseDto> {
    return this.contactsService.findById(requireOrganizationId(), id);
  }

  @Put(':id')
  @RequirePermission('contacts.write')
  @ApiOperation({ summary: 'Update contact details with optimistic concurrency check' })
  @ApiParam({ name: 'id', description: 'Contact UUID' })
  @ApiResponse({ status: 200, description: 'Updated contact details', type: ContactResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires contacts.write)' })
  @ApiResponse({ status: 404, description: 'Contact not found or cross-tenant' })
  @ApiResponse({ status: 409, description: 'Stale version or duplicate email' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactDto,
  ): Promise<ContactResponseDto> {
    return this.contactsService.update(requireOrganizationId(), requireUserId(), id, dto);
  }

  @Post(':id/archive')
  @RequirePermission('contacts.write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive a contact (soft-delete)' })
  @ApiParam({ name: 'id', description: 'Contact UUID' })
  @ApiResponse({ status: 200, description: 'Contact archived' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires contacts.write)' })
  @ApiResponse({ status: 404, description: 'Contact not found or cross-tenant' })
  @ApiResponse({ status: 409, description: 'Contact in use by active documents' })
  async archive(@Param('id', ParseUUIDPipe) id: string) {
    const contact = await this.contactsService.archive(requireOrganizationId(), requireUserId(), id);
    return { id: contact.id, isArchived: contact.isArchived };
  }

  @Post(':id/restore')
  @RequirePermission('contacts.write')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived contact' })
  @ApiParam({ name: 'id', description: 'Contact UUID' })
  @ApiResponse({ status: 200, description: 'Contact restored' })
  @ApiResponse({ status: 403, description: 'Forbidden (requires contacts.write)' })
  @ApiResponse({ status: 404, description: 'Contact not found or cross-tenant' })
  async restore(@Param('id', ParseUUIDPipe) id: string) {
    const contact = await this.contactsService.restore(requireOrganizationId(), requireUserId(), id);
    return { id: contact.id, isArchived: contact.isArchived };
  }
}
