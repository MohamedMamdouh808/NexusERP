import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../badge';
import { BADGE_STATUSES } from '../../../dev/gallery/state-manifest';

describe('Status not conveyed by colour alone (T070, FR-022, FR-044)', () => {
  it.each(BADGE_STATUSES)('displays the status %s text visibly so it is readable without colour', (status) => {
    render(<Badge status={status} />);
    const badge = screen.getByText(status);
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toBe(status);
  });
});
