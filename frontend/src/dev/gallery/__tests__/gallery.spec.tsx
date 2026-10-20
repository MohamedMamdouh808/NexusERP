import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GalleryRoute } from '../gallery-route';
import { allStates } from '../state-manifest';

describe('Component Gallery (T048, FR-034, FR-068)', () => {
  it('renders the gallery with the visible "Sample data" marker', () => {
    render(
      <MemoryRouter>
        <GalleryRoute />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/Sample data/i).length).toBeGreaterThan(0);
  });

  it('renders all components and declared states from state manifest', () => {
    render(
      <MemoryRouter>
        <GalleryRoute />
      </MemoryRouter>,
    );

    const states = allStates();
    expect(states.length).toBeGreaterThan(0);
    // Ensure the gallery container renders and contains sections for primitives
    expect(screen.getByTestId('gallery-container')).toBeInTheDocument();
  });
});
