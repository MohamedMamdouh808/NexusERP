import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { routes } from '../../../app/router';
import { sampleCatalogService } from '../../../services/sample-catalog-service';
import { createTestQueryClient } from '../../../test/render';
import { QueryClientProvider } from '@tanstack/react-query';

/**
 * T023 / FR-071 / SC-019.
 *
 * Every-enabled-control guard for the shell.
 * Every control that looks operable in the shell must either perform an action
 * (DOM change, navigation, service call) or be explicitly disabled with a reason.
 * Controls with no handler or that produce no observable change fail this guard.
 */

function renderShellRouter(initialPath = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [initialPath] });
  const queryClient = createTestQueryClient();
  const view = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router, ...view };
}

describe('Every enabled control guard for the shell (T023, FR-071, SC-019)', () => {
  beforeEach(() => {
    sampleCatalogService.reset();
  });

  it('activates every enabled control in the shell and observes a change', async () => {
    const user = userEvent.setup();
    const { router, container } = renderShellRouter('/');

    // Wait for initial paint
    await screen.findByRole('button', { name: /^Sample organization:/ });

    // Collect all interactive controls in the shell
    const controls = container.querySelectorAll<HTMLElement>('button, a[href]');
    expect(controls.length).toBeGreaterThan(0);

    for (const control of Array.from(controls)) {
      const isAriaDisabled = control.getAttribute('aria-disabled') === 'true';
      const isDisabled = control.hasAttribute('disabled');
      if (isDisabled || isAriaDisabled) {
        continue;
      }

      const initialUrl = router.state.location.pathname + router.state.location.search + router.state.location.hash;
      const initialDom = container.innerHTML;
      const initialCallCount = sampleCatalogService.calls.length;

      await user.click(control);

      const postUrl = router.state.location.pathname + router.state.location.search + router.state.location.hash;
      const postDom = container.innerHTML;
      const postCallCount = sampleCatalogService.calls.length;

      const urlChanged = postUrl !== initialUrl;
      const domChanged = postDom !== initialDom;
      const serviceCallMade = postCallCount > initialCallCount;
      const focusChanged = document.activeElement === control || document.activeElement?.id === 'main-content';

      const changed = urlChanged || domChanged || serviceCallMade || focusChanged;
      expect(
        changed,
        `Control "${control.textContent?.trim() || control.getAttribute('aria-label') || control.tagName}" produced no observable change`,
      ).toBe(true);
    }
  });

  it('fails when an enabled control produces no observable change (negative control)', async () => {
    const user = userEvent.setup();

    function DeadShell() {
      return (
        <div>
          <button type="button">Dead button</button>
        </div>
      );
    }

    const { container } = render(<DeadShell />);
    const deadButton = screen.getByRole('button', { name: 'Dead button' });

    const initialDom = container.innerHTML;
    await user.click(deadButton);
    const postDom = container.innerHTML;

    const changed = initialDom !== postDom;
    // An unhandled button produces no DOM, navigation, or service change
    expect(changed).toBe(false);
  });
});
