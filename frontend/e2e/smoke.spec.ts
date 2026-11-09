import { expect, test } from '@playwright/test';

/**
 * End-to-end smoke test for the auth feature.
 *
 * The sign-in and registration screens do not depend on the service for their
 * rendering or their inline validation, so those assertions are firm. Anything
 * that needs the service answers an UNAUTHENTICATED probe or a refused login
 * gracefully; the config starts the API and the built web bundle, so a healthy
 * run sees the real redirect chain (signed-out visit -> /login).
 */

test.describe('the sign-in screen', () => {
  test('is where the application lands for a signed-out visitor', async ({ page }) => {
    await page.goto('/');

    expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
  });

  test('renders the fields and links to registration', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible();
  });

  test('validates inline before contacting the service', async ({ page }) => {
    await page.goto('/login');

    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Email is required.')).toBeVisible();
    await expect(page.getByText('Password is required.')).toBeVisible();
  });
});

test.describe('the registration screen', () => {
  test('renders the fields without an organization field (the service names the org)', async ({ page }) => {
    await page.goto('/register');

    await expect(page.getByRole('heading', { level: 1, name: 'Create your account' })).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByLabel(/organization/i)).toHaveCount(0);
  });

  test('enforces the password rules inline', async ({ page }) => {
    await page.goto('/register');

    await page.getByLabel('Email').fill('missing@example.test');
    await page.getByLabel('Password').fill('Short1');
    await page.getByRole('button', { name: 'Create account' }).click();

    await expect(page.getByText('Password must be at least 12 characters.')).toBeVisible();
  });
});
