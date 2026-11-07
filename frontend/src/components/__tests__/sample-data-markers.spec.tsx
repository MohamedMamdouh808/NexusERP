import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { TopBar } from '../shell/top-bar';
import { GalleryRoute } from '../../dev/gallery/gallery-route';
import { renderWithProviders } from '../../test/render';

describe('Sample data markers on surfaces (T061, FR-041)', () => {
  it('renders no "Sample data" marker in the top bar', () => {
    renderWithProviders(<TopBar />);

    expect(screen.queryByText('Sample data')).toBeNull();
  });

  it('renders no "Sample data" marker in the component gallery', () => {
    renderWithProviders(<GalleryRoute />);

    expect(screen.queryByText('Sample data')).toBeNull();
  });
});
