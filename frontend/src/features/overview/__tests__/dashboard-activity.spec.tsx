import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { createTestQueryClient } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { OverviewPage } from '../dashboard-page';
import { ACTIVITY_LABELS, BACKEND_AUDIT_ACTION_CODES } from '../activity-labels';
import { AUDIT_FIXTURE, dashboardFetch, fetchRouter } from './dashboard-fixtures';
import enDashboard from '../../../i18n/locales/en/dashboard';

/** Flatten the English dashboard locale for spec-level probes. */
function flattenEn(value: Record<string, unknown>, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, v] of Object.entries(value)) {
    const full = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof v === 'string') out.set(full, v);
    else if (v !== null && typeof v === 'object') for (const [k, item] of flattenEn(v as Record<string, unknown>, full)) out.set(k, item);
  }
  return out;
}
const EN = flattenEn(enDashboard as unknown as Record<string, unknown>, 'dashboard');
const sentenceOf = (action: string): string => (ACTIVITY_LABELS[action] !== undefined ? EN.get(ACTIVITY_LABELS[action]) ?? action : action);
const formatTime = (stamp: string): string =>
  new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit' }).format(new Date(stamp));

/**
 * US5 - recent activity (T022, FR-011).
 *
 * The eight latest entries render as readable sentences with a tinted icon
 * and the record's id as a link when one exists; without audit.read the
 * block is absent. A central map (`activity-labels.ts`) now labels every
 * audit action code the backend can write - the fail-safe test asserts the
 * map and the backend vocabulary stay in agreement.
 */
describe('Dashboard recent activity (T022)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetSession();
  });

  function stubAllEndpoints() {
    const fetchMock = fetchRouter(dashboardFetch());
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function renderDashboard() {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <OverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('renders the eight entries as readable sentences', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    const first = await screen.findByText(sentenceOf('INVOICE_ISSUED'));
    expect(first).toBeInTheDocument();
    for (const entry of AUDIT_FIXTURE.entries) {
      expect(await screen.findByText(sentenceOf(entry.action))).toBeInTheDocument();
    }
  });

  it('links the record the entry is about when one exists', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByRole('link', { name: 'inv-1' })).toHaveAttribute('href', '/invoicing/inv-1');
    expect(screen.getByRole('link', { name: 'pay-1' })).toHaveAttribute('href', '/invoicing/payments/pay-1');
    expect(screen.getByRole('link', { name: 'so-1' })).toHaveAttribute('href', '/sales/so-1');
    expect(screen.getByRole('link', { name: 'po-1' })).toHaveAttribute('href', '/purchasing/po-1');
    expect(screen.getByRole('link', { name: 'p-1' })).toHaveAttribute('href', '/products/p-1');
    expect(screen.getByRole('link', { name: 'c-1' })).toHaveAttribute('href', '/contacts/c-1');
    // Entries without a recordId carry no link.
    expect(screen.queryByRole('link', { name: 'audit-8' })).not.toBeInTheDocument();
  });

  it('renders the time next to the sentence', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText(formatTime('2026-11-16T09:00:00.000Z'))).toBeInTheDocument();
    expect(screen.getByText(formatTime('2026-11-16T11:00:00.000Z'))).toBeInTheDocument();
  });

  it('groups the entries under day headings', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    const { container } = renderDashboard();

    await screen.findByText(sentenceOf('INVOICE_ISSUED'));
    const dividers = container.querySelectorAll('.overview-page__activity-divider');
    expect(dividers.length).toBeGreaterThan(0);
    for (const divider of Array.from(dividers)) {
      expect(['Today', 'Yesterday', 'Earlier']).toContain(divider.textContent);
    }
  });

  it('renders nothing from the before/after payloads', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    const { container } = renderDashboard();

    await screen.findByText(sentenceOf('INVOICE_ISSUED'));
    expect(container.textContent).not.toContain('supersecret');
    expect(container.textContent).not.toContain('passwordHash');
  });

  it('is absent for a member without audit.read', async () => {
    seedSignedInSession({ permissions: ['sales.read'] });
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText('Sales orders awaiting shipment')).toBeInTheDocument();
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument();
    const auditCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/v1/audit-logs'));
    expect(auditCalls).toHaveLength(0);
  });

  it('labels every audit action code the backend can write', () => {
    for (const code of BACKEND_AUDIT_ACTION_CODES) {
      expect(ACTIVITY_LABELS[code]).toBeDefined();
    }
  });
});
