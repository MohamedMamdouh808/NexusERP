import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Skeleton, EmptyState, ErrorState } from '../index';

describe('Feedback primitives states (T045, FR-031-FR-033, FR-050)', () => {
  describe('Skeleton', () => {
    it('renders default state with aria-busy and accessible hidden description', () => {
      render(<Skeleton label="Loading products..." />);
      const skeleton = screen.getByRole('status');
      expect(skeleton).toHaveAttribute('aria-busy', 'true');
      expect(screen.getByText('Loading products...')).toHaveClass('sr-only');
    });

    it('renders reduced motion variant without animation', () => {
      render(<Skeleton label="Loading..." reducedMotion />);
      const bar = document.querySelector('.skeleton__bar');
      expect(bar).toBeInTheDocument();
      expect(bar).toHaveClass('skeleton__bar--no-animation');
    });
  });

  describe('EmptyState', () => {
    it('renders with primary create action', async () => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      render(
        <EmptyState
          title="No Products"
          description="Create your first catalog product."
          actionLabel="Add Product"
          onAction={onAction}
        />,
      );
      expect(screen.getByRole('heading', { name: 'No Products', level: 3 })).toBeInTheDocument();
      expect(screen.getByText('Create your first catalog product.')).toBeInTheDocument();

      const btn = screen.getByRole('button', { name: 'Add Product' });
      await user.click(btn);
      expect(onAction).toHaveBeenCalled();
    });

    it('renders without create action', () => {
      render(
        <EmptyState
          title="No Logs Found"
          description="There are no audit logs for the selected date range."
        />,
      );
      expect(screen.getByRole('heading', { name: 'No Logs Found', level: 3 })).toBeInTheDocument();
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });

  describe('ErrorState', () => {
    it('renders retryable error with request identifier and retry action', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      render(
        <ErrorState
          message="Could not load inventory balance"
          requestId="req_123456"
          onRetry={onRetry}
        />,
      );
      expect(screen.getByText('Could not load inventory balance')).toBeInTheDocument();
      expect(screen.getByText(/req_123456/)).toBeInTheDocument();

      const retryBtn = screen.getByRole('button', { name: /Retry/i });
      await user.click(retryBtn);
      expect(onRetry).toHaveBeenCalled();
    });

    it('renders non-retryable error without retry control', () => {
      render(
        <ErrorState
          message="Access forbidden to this resource"
          requestId="req_789012"
        />,
      );
      expect(screen.getByText('Access forbidden to this resource')).toBeInTheDocument();
      expect(screen.getByText(/req_789012/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Retry/i })).not.toBeInTheDocument();
    });
  });
});
