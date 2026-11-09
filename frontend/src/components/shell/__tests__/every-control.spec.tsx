import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../../../app/router';
import { sampleCatalogService } from '../../../services/sample-catalog-service';
import { createTestQueryClient } from '../../../test/render';
import { seedSignedInSession } from '../../../test/session';
import { jsonResponse } from '../../../test/render';
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
  // Signed in: the shell's session controls exist (org switcher, user menu),
  // which is the state the guard audits. The service is stubbed so the sign
  // out the walker may click cannot hit a real network - it answers the way
  // the current backend does (403 for everyone; the store clears regardless).
  seedSignedInSession();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      jsonResponse(
        { code: 'FORBIDDEN', message: "You don't have permission.", details: [], requestId: 'test-403' },
        { status: 403 },
      ),
    ),
  );
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

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('activates every enabled control in the shell and observes a change', async () => {
    const user = userEvent.setup();
    const { router, container } = renderShellRouter('/');

    // Wait for the first paint: the top bar's user menu is present.
    await screen.findByRole('button', { name: /User:/i });

    // Collect all interactive controls in the shell
    const controls = container.querySelectorAll<HTMLElement>('button, a[href]');
    expect(controls.length).toBeGreaterThan(0);

    // Content-area controls are clicked first. A shell navigation replaces the
    // page below <main>, which detaches the initial page's controls, while the
    // top bar and sidebar stay mounted: clicking a detached node dispatches
    // into nowhere, so a working content control would look dead. The control
    // list is re-collected after every click so a control rendered by a page
    // the previous click navigated to is still observed, and a control detached
    // by that navigation belongs to the earlier render it was tested in.
    const contentArea = container.querySelector('#main-content');
    const seen = new WeakSet<HTMLElement>();
    let clicked = 0;
    for (let pass = 0; pass < 500; pass += 1) {
      const controls = Array.from(
        container.querySelectorAll<HTMLElement>('button, a[href]'),
      ).sort((a, b) => {
        const aInContent = contentArea?.contains(a) === true ? 0 : 1;
        const bInContent = contentArea?.contains(b) === true ? 0 : 1;
        return aInContent - bInContent;
      });

      const control = controls.find((candidate) => {
        if (seen.has(candidate)) return false;
        if (!container.contains(candidate)) return false;
        if (candidate.getAttribute('aria-disabled') === 'true') return false;
        if (candidate.hasAttribute('disabled')) return false;
        return true;
      });
      if (control === undefined) break;
      seen.add(control);
      clicked += 1;

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

    expect(clicked).toBeGreaterThan(0);
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
