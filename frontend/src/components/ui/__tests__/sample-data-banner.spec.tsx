import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';

import { SampleDataBanner, SAMPLE_BANNER_SIGNED_IN_TEXT } from '../sample-data-banner';
import { renderWithProviders } from '../../../test/render';
import { seedSignedInSession } from '../../../test/session';

/**
 * The sample-data banner speaks with the session: the short marker when nobody
 * is signed in, the exact "not connected yet" sentence once a real user is
 * signed in, and nothing at all for a module `real-modules.ts` marks as backed
 * by the service. The banner itself is static text - never keyed by the real
 * organization or user.
 */

describe('SampleDataBanner', () => {
  it('shows the short marker when no session is signed in', () => {
    // No seed: the store sits in its fresh pending state between tests.
    renderWithProviders(<SampleDataBanner />);

    const banner = screen.getByText('Sample data');
    expect(banner.className).toContain('sample-banner');
  });

  it('shows the exact signed-in sentence for a real user', () => {
    seedSignedInSession();
    renderWithProviders(<SampleDataBanner moduleKey="products" />);

    expect(screen.getByText(SAMPLE_BANNER_SIGNED_IN_TEXT)).toBeInTheDocument();
    // The banner carries the module key it speaks for.
    const banner = screen.getByText(SAMPLE_BANNER_SIGNED_IN_TEXT);
    expect(banner.getAttribute('data-module')).toBe('products');
  });

  it('renders nothing for a module the config marks as real', () => {
    seedSignedInSession();
    renderWithProviders(<SampleDataBanner moduleKey="health" />);

    expect(screen.queryByText('Sample data')).toBeNull();
    expect(screen.queryByText(SAMPLE_BANNER_SIGNED_IN_TEXT)).toBeNull();
  });

  it('never claims the sample rows belong to any specific organization', () => {
    seedSignedInSession({ email: 'nora@example.test' });
    renderWithProviders(<SampleDataBanner />);

    expect(screen.queryByText(/nora@example\.test/i)).toBeNull();
  });
});
