import type { ExecutionContext } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../platform/prisma/prisma.service';
import { PasswordChangeGuard } from '../../../common/guards/password-change.guard';
import { AppException } from '../../../common/errors/all-exceptions.filter';

describe('PasswordChangeGuard', () => {
  let guard: PasswordChangeGuard;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PasswordChangeGuard,
        { provide: PrismaService, useValue: { user: { findUnique: jest.fn() } } },
      ],
    }).compile();

    guard = moduleRef.get(PasswordChangeGuard);
    prisma = moduleRef.get(PrismaService);
  });

  const mockContext = (userId?: string, url = '', method = 'GET') =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ userId, url, method }),
      }),
    } as unknown as ExecutionContext);

  it('allows requests when mustChangePassword is false', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      mustChangePassword: false,
    });
    await expect(guard.canActivate(mockContext('user-1', '/api/v1/something'))).resolves.toBe(true);
  });

  it('allows requests when no userId on request', async () => {
    await expect(guard.canActivate(mockContext(undefined, '/api/v1/something'))).resolves.toBe(true);
  });

  it('allows change-password route when flag is set', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      mustChangePassword: true,
    });
    await expect(
      guard.canActivate(mockContext('user-1', '/api/v1/auth/change-password', 'POST')),
    ).resolves.toBe(true);
  });

  it('allows me route when flag is set', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      mustChangePassword: true,
    });
    await expect(guard.canActivate(mockContext('user-1', '/api/v1/auth/me', 'GET'))).resolves.toBe(
      true,
    );
  });

  it('allows logout route when flag is set', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      mustChangePassword: true,
    });
    await expect(guard.canActivate(mockContext('user-1', '/api/v1/auth/logout', 'POST'))).resolves.toBe(
      true,
    );
  });

  it('refuses other routes with 403 PASSWORD_CHANGE_REQUIRED when flag is set', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      mustChangePassword: true,
    });
    await expect(
      guard.canActivate(mockContext('user-1', '/api/v1/something', 'GET')),
    ).rejects.toThrow(AppException);
  });
});
