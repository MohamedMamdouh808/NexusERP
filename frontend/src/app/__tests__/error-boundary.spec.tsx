import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders } from '../../test/render';
import { ErrorBoundary } from '../error-boundary';

/**
 * T088. The boundary is the last line of defence, and its only real requirement is
 * that it fails quietly: the user is told the interface did not load, and is NOT
 * shown the error, its message or its stack. A stack trace on screen is the same
 * disclosure the service is forbidden from putting in a response body.
 */
function Exploding(): JSX.Element {
  throw new Error('SECRET internal component failure: postgresql://user:pw@127.0.0.1:5432');
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // React prints the caught error itself; silence it so the test output stays readable
  // while the assertions still check that nothing reaches the DOM.
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  vi.unstubAllGlobals();
});

describe('ErrorBoundary (T088)', () => {
  it('renders its children when nothing fails', () => {
    renderWithProviders(
      <ErrorBoundary>
        <p>content marker</p>
      </ErrorBoundary>,
    );

    expect(screen.getByText('content marker')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a quiet failure state instead of the interface', () => {
    renderWithProviders(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i);
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('never prints the error, its message or its cause', () => {
    const { container } = renderWithProviders(
      <ErrorBoundary>
        <Exploding />
      </ErrorBoundary>,
    );

    const rendered = container.textContent ?? '';
    expect(rendered).not.toContain('SECRET');
    expect(rendered).not.toContain('postgresql://');
    expect(rendered).not.toContain('127.0.0.1');
    expect(rendered).not.toContain('Error');
  });

  it('offers a reload that actually reloads', async () => {
    const reload = vi.fn();
    const user = userEvent.setup();
    const original = window.location;

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, reload },
    });

    try {
      renderWithProviders(
        <ErrorBoundary>
          <Exploding />
        </ErrorBoundary>,
      );

      await user.click(screen.getByRole('button', { name: /reload/i }));

      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });
});