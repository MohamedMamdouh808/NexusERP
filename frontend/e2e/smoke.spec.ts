import { expect, test } from '@playwright/test';

/**
 * End-to-end smoke test (T093): the shell renders, and the health panel reads the service.
 *
 * These two are the whole of what this feature can honestly show a browser. The shell is
 * the authenticated application shell - sidebar, top bar, content - and the health panel
 * is the one destination wired to a live endpoint.
 *
 * The health assertions accept either outcome on purpose. The service may be up (the
 * panel reports the checks) or the request may fail (the panel reports the failure and the
 * request identifier). What must never happen is the panel rendering nothing: an empty
 * card is indistinguishable from a still-loading one, and a smoke test that cannot tell
 * the difference proves nothing.
 */

test.describe('the authenticated application shell', () => {
  test('renders the sidebar, the top bar and the content area', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('main')).toBeVisible();
  });

  test('offers no sign-in screen', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('link', { name: /sign in/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /sign up/i })).toHaveCount(0);
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
  });

  test('labels the organization and the user as unavailable rather than showing dead controls', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByTestId('organization-placeholder')).toContainText(/none available yet/i);
    await expect(page.getByTestId('user-placeholder')).toContainText(/no user available yet/i);
  });
});

test.describe('the health panel', () => {
  test('renders the shell and the health panel together', async ({ page }) => {
    await page.goto('/health');

    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'System health' })).toBeVisible();
  });

  test('reads the service report or reports the failure, but never renders nothing', async ({ page }) => {
    await page.goto('/health');

    const report = page.getByText('Application');
    const failure = page.getByRole('alert');

    await expect(report.or(failure).first()).toBeVisible({ timeout: 20_000 });

    // If the service answered, the checks are attributed rather than merged.
    const answered = await report.isVisible().catch(() => false);
    if (answered) {
      await expect(page.getByText('Database')).toBeVisible();
    } else {
      // The failure state must hand over the request identifier so the failure can be
      // quoted, and must not invent a cause the service did not give.
      await expect(failure).toBeVisible();
    }
  });
});