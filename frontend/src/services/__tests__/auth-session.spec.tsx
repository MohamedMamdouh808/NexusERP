/**
 * T007 - Foundation test for the extended /auth/me session payload (FR-027).
 *
 * After a successful probe, the store carries the organization's enabled
 * modules, currency code and default payment terms so the interface adapts
 * without an extra call. `bootstrapSession(true)` forces a re-probe even when
 * the store is already signed in.
 *
 * Written first: it must fail until T016 adds `enabledModules` to the session
 * types and `loadSignedInSession()` hydrates them.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { act } from 'react';
import { bootstrapSession, type SessionState, useSession } from '../auth-session';
import { TEST_ORGANIZATION, resetSession } from '../../test/session';
import { jsonResponse } from '../../test/render';

function stubMe(organization: unknown) {
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);
      if (url.includes('/auth/me')) {
        return jsonResponse({
          user: { id: 'test-user-1', email: 'nora.eaton@example.test', mustChangePassword: false },
          membership: {
            id: 'test-membership-1',
            roles: [{ id: 'r', key: 'administrator', name: 'Administrator' }],
            name: 'Nora Eaton',
            isActive: true,
          },
          organization,
          permissions: [],
        });
      }
      if (url.includes('/auth/organizations')) {
        return jsonResponse([]);
      }
      return new Response(null, { status: 404 });
    },
  ) as unknown;
}

describe('Session payload carries enabled modules, currency and terms (T007, FR-027)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetSession();
  });

  it('hydrates enabledModules, currencyCode and defaultPaymentTermsDays from /auth/me', async () => {
    resetSession();
    stubMe({
      id: 'test-org-1',
      name: 'Test Organization (One)',
      currencyCode: 'EUR',
      defaultPaymentTermsDays: 45,
      enabledModules: ['inventory', 'sales'],
    });

    const holder: { state: SessionState | null } = { state: null };
    function Probe() {
      holder.state = useSession();
      return null;
    }
    render(<Probe />);

    await act(async () => {
      await bootstrapSession(true);
    });

    expect(holder.state?.status).toBe('signed-in');
    const captured = holder.state;
    if (captured?.status !== 'signed-in') throw new Error('expected signed-in session');
    expect(captured.organization.enabledModules).toEqual(['inventory', 'sales']);
    expect(captured.organization.currencyCode).toBe('EUR');
    expect(captured.organization.defaultPaymentTermsDays).toBe(45);
  });

  it('seeds a signed-in session with the five switchable modules enabled by default', () => {
    expect(TEST_ORGANIZATION.enabledModules).toEqual([
      'inventory',
      'purchasing',
      'sales',
      'invoicing',
      'reports',
    ]);
    expect(TEST_ORGANIZATION.defaultPaymentTermsDays).toBe(30);
    expect(TEST_ORGANIZATION.currencyCode).toBe('USD');
  });
});
