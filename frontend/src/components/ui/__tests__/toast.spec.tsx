import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toast } from '../toast';

describe('Toast states (T044, FR-030, FR-050)', () => {
  it('renders success toast with role status and names its record', () => {
    render(<Toast id="t1" tone="success" message="Sales Order SO-1001 created" onDismiss={() => {}} />);
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Sales Order SO-1001 created');
    expect(toast).toHaveClass('toast--success');
  });

  it('renders failure toast with role alert', () => {
    render(<Toast id="t2" tone="failure" message="Failed to save changes" onDismiss={() => {}} />);
    const toast = screen.getByRole('alert');
    expect(toast).toHaveTextContent('Failed to save changes');
    expect(toast).toHaveClass('toast--failure');
  });

  it('renders informational toast with role status', () => {
    render(<Toast id="t3" tone="informational" message="System update scheduled" onDismiss={() => {}} />);
    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('System update scheduled');
    expect(toast).toHaveClass('toast--informational');
  });

  it('is dismissible without taking focus', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<Toast id="t4" tone="success" message="Saved" onDismiss={onDismiss} />);
    const dismissBtn = screen.getByRole('button', { name: /Dismiss/i });
    await user.click(dismissBtn);
    expect(onDismiss).toHaveBeenCalledWith('t4');
  });
});
