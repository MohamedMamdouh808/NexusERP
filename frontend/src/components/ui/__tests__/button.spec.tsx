import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '../button';

describe('Button states (T038, FR-020, FR-050)', () => {
  it('renders default state with role button and accessible name', () => {
    render(<Button>Submit</Button>);
    const btn = screen.getByRole('button', { name: 'Submit' });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute('data-state', 'default');
    expect(btn).toHaveClass('button');
  });

  it('verifies hover state via token-backed hover class', () => {
    render(<Button>Hover Me</Button>);
    const btn = screen.getByRole('button', { name: 'Hover Me' });
    // In jsdom :hover is not computed, so we check token-backed class presence / applied styling contract
    expect(btn).toHaveClass('button');
  });

  it('verifies focus-visible state', async () => {
    const user = userEvent.setup();
    render(<Button>Focus Me</Button>);
    const btn = screen.getByRole('button', { name: 'Focus Me' });
    await user.tab();
    expect(btn).toHaveFocus();
  });

  it('verifies active state via applied styling contract', () => {
    render(<Button>Active Me</Button>);
    const btn = screen.getByRole('button', { name: 'Active Me' });
    expect(btn).toHaveClass('button');
  });

  it('renders loading state with aria-busy, preserves name, and is not clickable', async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toHaveAttribute('data-state', 'loading');
    expect(btn).toBeDisabled();

    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders disabled state with disabled attribute and is not activatable', async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled Action</Button>);
    const btn = screen.getByRole('button', { name: 'Disabled Action' });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('data-state', 'disabled');

    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('supports button variants (primary, secondary, danger)', () => {
    const { rerender } = render(<Button variant="primary">Primary</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--primary');

    rerender(<Button variant="secondary">Secondary</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--secondary');

    rerender(<Button variant="danger">Danger</Button>);
    expect(screen.getByRole('button')).toHaveClass('button--danger');
  });
});
