import type { ReactNode } from 'react';

import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';

/**
 * The authenticated application shell (T086).
 *
 * MASTER.md "Page Pattern" names this pattern "Authenticated App Shell" and states
 * there is no marketing or landing page pattern in v1. So this is the shell, not a
 * landing page: a persistent sidebar, a top bar, and a content area, with no hero,
 * no logo wall, no pricing block.
 *
 * `skip to content` is the first focusable element. Without it a keyboard user
 * tabs through the whole sidebar on every page (T102, WCAG 2.4.1).
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <a className="sr-only" href="#main-content">
        Skip to main content
      </a>
      <TopBar />
      <Sidebar />
      <main className="app-shell__content" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
