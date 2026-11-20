import { Test } from '@nestjs/testing';
import { PasswordChangeGuard } from '../../../common/guards/password-change.guard';
import { AppException } from '../../../common/errors/all-exceptions.filter';
import type { ExecutionContext } from '@nestjs/common';

describe('PasswordChangeGuard', () => {
  let guard: PasswordChangeGuard;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PasswordChangeGuard],
    }).compile();

    guard = moduleRef.get(PasswordChangeGuard);
  });

  const mockContext = (userId?: string, url = '', method = 'GET', mustChangePassword = false) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          userId,
          identity: userId ? { user: { mustChangePassword } } : undefined,
          url,
          method,
        }),
      }),
    } as unknown as ExecutionContext);

  it('allows requests when mustChangePassword is false', async () => {
    await expect(guard.canActivate(mockContext('user-1', '/api/v1/something'))).resolves.toBe(true);
  });

  it('allows requests when no userId on request', async () => {
    await expect(guard.canActivate(mockContext(undefined, '/api/v1/something'))).resolves.toBe(true);
  });

  it('allows change-password route when flag is set', async () => {
    await expect(
      guard.canActivate(mockContext('user-1', '/api/v1/auth/change-password', 'POST', true)),
    ).resolves.toBe(true);
  });

  it('allows me route when flag is set', async () => {
    await expect(
      guard.canActivate(mockContext('user-1', '/api/v1/auth/me', 'GET', true)),
    ).resolves.toBe(true);
  });

  it('allows logout route when flag is set', async () => {
    await expect(
      guard.canActivate(mockContext('user-1', '/api/v1/auth/logout', 'POST', true)),
    ).resolves.toBe(true);
  });

  it('refuses other routes with 403 PASSWORD_CHANGE_REQUIRED when flag is set', async () => {
    await expect(
      guard.canActivate(mockContext('user-1', '/api/v1/something', 'GET', true)),
    ).rejects.toThrow(AppException);
  });
});
