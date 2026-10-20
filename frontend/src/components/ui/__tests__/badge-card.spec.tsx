import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, Card } from '../index';
import { BADGE_STATUSES } from '../../../dev/gallery/state-manifest';

describe('Badge and Card states (T040, FR-022, FR-023, FR-050)', () => {
  describe('Badge', () => {
    it.each(BADGE_STATUSES)('renders status %s verbatim with tone attribute', (status) => {
      render(<Badge status={status} />);
      const badge = screen.getByText(status);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveAttribute('data-tone');
      expect(badge).toHaveClass('badge');
    });

    it('conveys status by text rather than color alone', () => {
      render(<Badge status="CONFIRMED" />);
      const badge = screen.getByText('CONFIRMED');
      expect(badge.textContent).toBe('CONFIRMED');
    });
  });

  describe('Card', () => {
    it('renders title-only state', () => {
      render(<Card title="Revenue Summary">Card Content</Card>);
      expect(screen.getByRole('heading', { name: 'Revenue Summary', level: 2 })).toBeInTheDocument();
      expect(screen.getByText('Card Content')).toBeInTheDocument();
    });

    it('renders with description', () => {
      render(
        <Card title="Monthly Breakdown" description="Fiscal year 2026">
          Details
        </Card>,
      );
      expect(screen.getByText('Fiscal year 2026')).toBeInTheDocument();
    });

    it('renders with actions', () => {
      render(
        <Card title="Actions Card" actions={<button type="button">Refresh</button>}>
          Content
        </Card>,
      );
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });
  });
});
