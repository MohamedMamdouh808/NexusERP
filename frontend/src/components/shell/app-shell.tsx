import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sampleCatalogService } from '../../services/sample-catalog-service';

import { Sidebar } from './sidebar';
import { TopBar } from './top-bar';
import { CommandPalette } from '../ui/command-palette';

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
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const modules = useQuery({ queryKey: ['modules'], queryFn: () => sampleCatalogService.listModules() });
  const gTimer = useRef<number | null>(null);
  useEffect(() => {
    const shortcuts: Record<string, string> = {
      o: '/',
      s: '/sales',
      i: '/inventory',
      p: '/products',
      c: '/contacts',
      r: '/reports',
      v: '/invoicing',
      u: '/users',
    };
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]') !== null;
      const command = event.ctrlKey || event.metaKey;
      if (command && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setMobileNavigationOpen(false);
        setPaletteOpen((open) => !open);
        return;
      }
      if (typing || command || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 'g') {
        if (gTimer.current !== null) window.clearTimeout(gTimer.current);
        gTimer.current = window.setTimeout(() => { gTimer.current = null; }, 900);
        return;
      }
      if (gTimer.current !== null && shortcuts[key]) {
        event.preventDefault();
        window.clearTimeout(gTimer.current);
        gTimer.current = null;
        setMobileNavigationOpen(false);
        navigate(shortcuts[key]);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (gTimer.current !== null) window.clearTimeout(gTimer.current);
    };
  }, [navigate]);
  const gatedModule = location.pathname.startsWith('/inventory') ? 'inventory' : location.pathname.startsWith('/purchasing') ? 'purchasing' : location.pathname.startsWith('/sales') ? 'sales' : location.pathname.startsWith('/invoicing') ? 'invoicing' : null;
  useEffect(() => {
    setMobileNavigationOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMobileNavigationOpen(false);
        menuButtonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [mobileNavigationOpen]);

  if (gatedModule && modules.data?.find((module) => module.key === gatedModule)?.enabled === false) {
    return <Navigate to="/settings/organization" replace state={{ notice: 'Turned off in Settings' }} />;
  }

  return (
    <div className="app-shell">
      <a className="sr-only" href="#main-content">
        Skip to main content
      </a>
      <TopBar
        menuButtonRef={menuButtonRef}
        mobileNavigationOpen={mobileNavigationOpen}
        onMenuToggle={() => setMobileNavigationOpen((open) => !open)}
        onOpenCommandPalette={() => {
          setMobileNavigationOpen(false);
          setPaletteOpen(true);
        }}
      />
      {mobileNavigationOpen && (
        <button
          type="button"
          className="mobile-navigation__overlay"
          aria-label="Close navigation drawer"
          onClick={() => setMobileNavigationOpen(false)}
        />
      )}
      <Sidebar className={mobileNavigationOpen ? 'app-shell__sidebar--open' : undefined} />
      <main className="app-shell__content" id="main-content" tabIndex={-1} key={location.pathname}>
        {children}
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
