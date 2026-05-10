import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';

import { TenantOnboardingChecklistWidget } from '../TenantOnboardingChecklistWidget';
import frMessages from '@/messages/fr.json';
import * as AuthContext from '@/context/AuthContext';
import * as Api from '@/lib/api';

/**
 * TCK-266 — `<TenantOnboardingChecklistWidget>` renders the four item
 * rows when an open checklist exists, and disappears entirely once the
 * checklist is completed.
 *
 * The widget orchestrates two fetch surfaces : (1) a client-side
 * `fetch('/api/leases?...')` for the active lease ids, and (2) the
 * `useApiQuery`-backed `apiRequest` for each lease's checklist. We mock
 * both layers separately to keep each test small.
 */
type FetchMock = ReturnType<typeof vi.fn>;

function setupFetchMap(routes: Record<string, { status?: number; body?: unknown }>): FetchMock {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const match = Object.keys(routes).find((needle) => url.includes(needle));
    const route = match ? routes[match] : { status: 404, body: {} };
    return {
      ok: (route.status ?? 200) >= 200 && (route.status ?? 200) < 300,
      status: route.status ?? 200,
      json: async () => route.body ?? {},
    };
  });
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

function mockAuth() {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    user: { id: 1, name: 'Alice', email: 'a@b.c' },
    token: 'tk',
    isLoading: false,
    setUser: vi.fn(),
    refreshUser: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  } as unknown as ReturnType<typeof AuthContext.useAuth>);
}

function withProviders(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="fr" messages={frMessages}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

describe('<TenantOnboardingChecklistWidget>', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when there is no active lease', async () => {
    mockAuth();
    setupFetchMap({
      '/api/leases': { body: { data: [] } },
    });

    const { container } = render(withProviders(<TenantOnboardingChecklistWidget />));
    await waitFor(() => expect(container.querySelector('section')).toBeNull());
    expect(container.textContent).toBe('');
  });

  it('renders the 4 items when an open checklist exists', async () => {
    mockAuth();
    setupFetchMap({
      '/api/leases': {
        body: { data: [{ id: 42, reference_number: 'LS-ABC' }] },
      },
    });

    // Mock apiRequest used by useApiQuery for the checklist read.
    vi.spyOn(Api, 'apiRequest').mockResolvedValue({
      data: {
        id: 1,
        lease_id: 42,
        user_id: 1,
        welcome_seen_at: null,
        inventory_completed_at: null,
        first_payment_at: null,
        documents_acknowledged_at: null,
        completed_at: null,
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-01T00:00:00Z',
      },
    } as never);

    render(withProviders(<TenantOnboardingChecklistWidget />));

    // Title interpolates the lease reference.
    await screen.findByText(/LS-ABC/);

    // The 4 item titles are rendered.
    expect(screen.getByText("Découvrir votre espace résident")).toBeInTheDocument();
    expect(screen.getByText("Signer l'état des lieux d'entrée")).toBeInTheDocument();
    expect(screen.getByText('Effectuer votre premier paiement')).toBeInTheDocument();
    expect(screen.getByText('Accuser réception de vos documents')).toBeInTheDocument();
  });

  it('hides itself when the checklist is completed', async () => {
    mockAuth();
    setupFetchMap({
      '/api/leases': {
        body: { data: [{ id: 99, reference_number: 'LS-DONE' }] },
      },
    });

    vi.spyOn(Api, 'apiRequest').mockResolvedValue({
      data: {
        id: 9,
        lease_id: 99,
        user_id: 1,
        welcome_seen_at: '2026-05-01T00:00:00Z',
        inventory_completed_at: '2026-05-02T00:00:00Z',
        first_payment_at: '2026-05-03T00:00:00Z',
        documents_acknowledged_at: '2026-05-04T00:00:00Z',
        completed_at: '2026-05-04T00:00:00Z',
        created_at: '2026-05-01T00:00:00Z',
        updated_at: '2026-05-04T00:00:00Z',
      },
    } as never);

    const { container } = render(withProviders(<TenantOnboardingChecklistWidget />));

    // Wait for the checklist query to settle, then assert no section is rendered.
    await waitFor(() => {
      expect(container.querySelector('section')).toBeNull();
    });
  });
});
