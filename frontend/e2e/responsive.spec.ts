import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 568, height: 320 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const ROUTES = [
  '/',
  '/health',
  '/products',
  '/products/new',
  '/contacts',
  '/contacts/new',
  '/inventory',
  '/purchasing',
  '/purchasing/new',
  '/sales',
  '/sales/new',
  '/invoicing',
  '/invoicing/payments/new',
  '/settings/organization',
  '/users',
  '/users/roles',
  '/audit-log',
  '/reports',
  '/profile',
] as const;

test('module pages stay within each supported viewport', async ({ page }) => {
  test.setTimeout(180_000);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    for (const route of ROUTES) {
      await page.goto(route);
      await expect(page.getByRole('main')).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        content: document.querySelector<HTMLElement>('.app-shell__content')?.clientWidth ?? 0,
        contentScroll: document.querySelector<HTMLElement>('.app-shell__content')?.scrollWidth ?? 0,
      }));
      expect(dimensions.document, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.viewport);
      expect(dimensions.contentScroll, `${route} content at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.content);
    }
  }
});

test('mobile navigation opens, locks background scroll, and closes after route selection', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');

  const trigger = page.getByRole('button', { name: 'Open navigation menu' });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('button', { name: 'Close navigation menu' })).toBeVisible();
  await expect.poll(() => page.locator('body').evaluate((body) => (body as HTMLElement).style.overflow)).toBe('hidden');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'System Health' }).click();
  await expect(page).toHaveURL(/\/health$/);
  await expect(page.getByRole('button', { name: 'Open navigation menu' })).toHaveAttribute('aria-expanded', 'false');
  await expect.poll(() => page.locator('body').evaluate((body) => (body as HTMLElement).style.overflow)).toBe('');
});
