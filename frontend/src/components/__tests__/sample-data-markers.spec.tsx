import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { TopBar } from '../shell/top-bar';
import { GalleryRoute } from '../../dev/gallery/gallery-route';
import { renderWithProviders } from '../../test/render';

describe('Sample data markers on surfaces (T061, FR-040, FR-041, SC-009)', () => {
  it('renders visible "Sample data" marker in the top bar', () => {
    renderWithProviders(<TopBar />);

    const marker = screen.getByText('Sample data');
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveClass('sample-marker');
  });

  it('renders visible "Sample data" marker in the component gallery', () => {
    renderWithProviders(<GalleryRoute />);

    const markers = screen.getAllByText('Sample data');
    expect(markers.length).toBeGreaterThan(0);
    expect(markers[0]).toHaveClass('sample-marker');
  });
});
