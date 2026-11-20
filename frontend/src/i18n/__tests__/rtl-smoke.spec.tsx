import { screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { renderWithProviders } from '../../test/render';
import { setAppLanguage } from '../index';
import { Breadcrumb } from '../../components/shell/breadcrumb';
import { Sidebar } from '../../components/shell/sidebar';

/**
 * A rendering-level smoke test for the Arabic interface: the language switch
 * is not just a resource swap, it is the document's `dir`, and the navigation
 * chrome must come out in Arabic with the correct accessible names. English is
 * restored afterwards so the rest of the suite sees its default.
 */
describe('the interface in Arabic', () => {
  beforeEach(async () => {
    await setAppLanguage('ar');
  });

  afterEach(async () => {
    await setAppLanguage('en');
  });

  it('sets the document language, direction and data-direction before render', () => {
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.dataset.direction).toBe('rtl');
  });

  it('renders the sidebar in Arabic with the Arabic group headings', () => {
    renderWithProviders(<Sidebar />);
    expect(screen.getByRole('navigation', { name: 'الرئيسية' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'عام' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'الإدارة' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'الإعدادات' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /نظرة عامة/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /المنتجات/ })).toHaveAttribute('href', '/products');
  });

  it('renders the breadcrumb in Arabic for a known destination', () => {
    renderWithProviders(<Breadcrumb />, { initialEntries: ['/products'] });
    expect(screen.getByRole('navigation', { name: 'مسار التنقل' })).toBeInTheDocument();
    expect(screen.getByText('الإدارة')).toBeInTheDocument();
    expect(screen.getByText('المنتجات')).toBeInTheDocument();
  });
});
