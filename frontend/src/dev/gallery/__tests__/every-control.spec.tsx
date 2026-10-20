import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { GalleryRoute } from '../gallery-route';

/** The gallery's operational controls must change visible state when activated. */
function visibleState(container: HTMLElement): string {
  return container.textContent ?? '';
}

describe('Every enabled control guard for gallery (T058, FR-071, SC-019)', () => {
  it('observes a state change for each enabled gallery operation', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <MemoryRouter>
        <GalleryRoute />
      </MemoryRouter>,
    );

    const failure = screen.getByRole('button', { name: 'Simulate failure' });
    let before = visibleState(container);
    await user.click(failure);
    expect(visibleState(container)).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Disable Failures' }));

    const slow = screen.getByRole('button', { name: 'Simulate slow response' });
    before = visibleState(container);
    await user.click(slow);
    expect(visibleState(container)).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Disable Delay' }));

    const empty = screen.getByRole('button', { name: 'Simulate empty data' });
    before = visibleState(container);
    await user.click(empty);
    expect(visibleState(container)).not.toBe(before);
    await user.click(screen.getByRole('button', { name: 'Show sample data' }));

    const openDialog = screen.getByRole('button', { name: 'Trigger Row Removal Dialog' });
    before = visibleState(container);
    await user.click(openDialog);
    expect(screen.getByRole('alertdialog', { name: 'Delete Sample Record' })).toBeInTheDocument();
    expect(visibleState(container)).not.toBe(before);

    const dialog = screen.getByRole('alertdialog', { name: 'Delete Sample Record' });
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(
      screen.queryByRole('alertdialog', { name: 'Delete Sample Record' }),
    ).not.toBeInTheDocument();

    await user.click(openDialog);
    before = visibleState(container);
    await user.click(screen.getByRole('button', { name: 'Delete Sample Record' }));
    expect(visibleState(container)).not.toBe(before);
    expect(screen.getByText(/Removed record:/)).toBeInTheDocument();
  }, 30000);

  it('detects an enabled control that produces no visible change', async () => {
    const user = userEvent.setup();
    const { container } = render(<button type="button">Deliberate no-op</button>);
    const button = screen.getByRole('button', { name: 'Deliberate no-op' });
    const before = visibleState(container);
    await user.click(button);
    const after = visibleState(container);

    // This is the guard's negative control: a dispatched click alone is not a change.
    expect(after === before).toBe(true);
  });
});
