import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/require-permission.decorator';
import { ERROR_CODES } from '@nexuserp/shared';
import { AppException } from '../../common/errors/all-exceptions.filter';
import { AuthService } from './auth.service';
import { SessionGuard, SessionRequest } from './guards/session.guard';
import { CONFIGURATION } from '../../config/configuration.module';
import { Configuration } from '../../config/configuration';

/**
 * Authentication controller. Register, login, and health are the only public
 * routes (FR-015). All other endpoints require a valid session and declare
 * a permission (default-deny, Constitution Principle II).
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(CONFIGURATION) private readonly configuration: Configuration,
  ) {}

  /**
   * Register a new user with their first organization. Public route.
   * Creates user, organization, membership, roles, permissions, warehouse,
   * and document sequences in one atomic transaction.
   */
  @Public()
  @Post('register')
  async register(@Body() body: { email: string; password: string }) {
    return this.authService.register(body.email, body.password);
  }

  /**
   * Log in with email and password. Public route. Issues an opaque session
   * cookie (HttpOnly, Secure, SameSite=Lax) and a CSRF token.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { email: string; password: string },
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(body.email, body.password);

    // Issue opaque session cookie
    response.cookie('session_id', result.sessionToken, {
      httpOnly: true,
      secure: this.configuration.isProduction,
      sameSite: 'lax',
      path: '/',
    });

    // Issue CSRF token cookie (readable by JS for X-CSRF-Token header)
    response.cookie('csrf_token', result.csrfToken, {
      httpOnly: false,
      secure: this.configuration.isProduction,
      sameSite: 'lax',
      path: '/',
    });

    return {
      user: result.user,
      membership: result.membership,
    };
  }

  /**
   * Log out. Invalidates the session and clears cookies. Requires a valid session.
   */
  @Post('logout')
  @UseGuards(SessionGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: SessionRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const sessionId = request.cookies?.['session_id'];
    if (sessionId) {
      await this.authService.logout(sessionId);
    }

    response.clearCookie('session_id', { path: '/' });
    response.clearCookie('csrf_token', { path: '/' });

    return { message: 'Logged out.' };
  }

  /**
   * Returns the current user's identity and active organization membership.
   * Requires a valid session.
   */
  @Public()
  @Get('me')
  @UseGuards(SessionGuard)
  async me(@Req() request: SessionRequest) {
    if (!request.userId || !request.membershipId) {
      throw new AppException(ERROR_CODES.UNAUTHENTICATED, [], 'Not authenticated.');
    }

    return this.authService.me(request.userId, request.membershipId);
  }

  /**
   * Returns all organizations the user is a member of, for the organization
   * switcher in the top bar. Requires a valid session.
   */
  @Public()
  @Get('organizations')
  @UseGuards(SessionGuard)
  async organizations(@Req() request: SessionRequest) {
    if (!request.userId) {
      throw new AppException(ERROR_CODES.UNAUTHENTICATED, [], 'Not authenticated.');
    }

    return this.authService.getOrganizations(request.userId);
  }

  /**
   * Switches the active organization for the session. Requires membership in
   * the target organization. State-changing: CSRF token validated.
   */
  @Post('switch-organization')
  @UseGuards(SessionGuard)
  async switchOrganization(
    @Body() body: { organizationId: string },
    @Req() request: SessionRequest,
  ) {
    if (!request.userId || !request.membershipId) {
      throw new AppException(ERROR_CODES.UNAUTHENTICATED, [], 'Not authenticated.');
    }

    return this.authService.switchOrganization(
      request.userId,
      request.membershipId,
      body.organizationId,
    );
  }
}
