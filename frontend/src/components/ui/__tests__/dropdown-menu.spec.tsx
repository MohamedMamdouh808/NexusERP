import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DropdownMenu } from '../dropdown-menu';

describe('DropdownMenu states (T043, FR-029, FR-050)', () => {
  const entries = [
    { kind: 'item' as const, id: '1', label: 'Edit', onSelect: vi.fn() },
    {
      kind: 'unavailable' as const,
      id: '2',
      label: 'Delete',
      reason: 'Feature unavailable in preview',
    },
  ];

  it('renders closed state with trigger and aria-expanded="false"', () => {
    render(<DropdownMenu trigger="Options" label="Actions" entries={entries} />);
    const trigger = screen.getByRole('button', { name: 'Options' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders open state and displays menu entries upon activation', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger="Options" label="Actions" entries={entries} />);
    const trigger = screen.getByRole('button', { name: 'Options' });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
  });

  it('renders entry-unavailable state with reason and aria-disabled="true"', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger="Options" label="Actions" entries={entries} />);
    await user.click(screen.getByRole('button', { name: 'Options' }));

    const disabledItem = screen.getByRole('menuitem', { name: /Delete/i });
    expect(disabledItem).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Feature unavailable in preview')).toBeInTheDocument();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(<DropdownMenu trigger="Options" label="Actions" entries={entries} />);
    const trigger = screen.getByRole('button', { name: 'Options' });

    await user.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
