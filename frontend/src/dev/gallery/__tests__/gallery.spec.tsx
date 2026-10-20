import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GalleryRoute } from '../gallery-route';
import { allStates, COMPONENTS } from '../state-manifest';

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
    const { container } = render(
      <MemoryRouter>
        <GalleryRoute />
      </MemoryRouter>,
    );

    const states = allStates();
    expect(states.length).toBeGreaterThan(0);
    expect(screen.getByTestId('gallery-container')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid^="gallery-section-"]')).toHaveLength(
      COMPONENTS.length,
    );

    for (const { component, state } of states) {
      const section = screen.getByTestId(`gallery-section-${component.toLowerCase()}`);
      const renderedStates = Array.from(section.querySelectorAll('code')).map((element) => element.textContent);
      expect(renderedStates).toContain(state);
    }

    expect(container).not.toHaveTextContent('Missing fixture');
  });
});
