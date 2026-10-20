import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Skeleton } from '../skeleton';

describe('Reduced motion handling (T069, FR-031, FR-044)', () => {
  it('applies non-animated static classes when reduced motion is preferred', () => {
    const { container } = render(<Skeleton label="Loading" reducedMotion />);
    const bar = container.querySelector('.skeleton__bar--no-animation');
    expect(bar).toBeInTheDocument();
  });
});
