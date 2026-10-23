/**
 * TCK-1732 (P168.03) — le relevé des commissions porte son statut et sa page dans l'URL. Tenus en
 * `useState`, ils se perdaient au retour du bail ouvert d'un clic, au rechargement et au lien copié.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CommissionsLedger } from '../CommissionsLedger';

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 1 } }),
}));

function routeur() {
  const spy = vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    let corps: unknown = {};
    if (url.includes('/api/me/capabilities')) corps = { data: { agency_id: 3, capabilities: [] } };
    else if (url.includes('/api/commissions')) {
      corps = {
        data: [],
        meta: { current_page: 2, last_page: 3, per_page: 20, total: 50, totals: { due: 0, paid: 0, cancelled: 0 } },
      };
    }
    return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><CommissionsLedger /></QueryClientProvider>));
}

function appelsCommissions(spy: ReturnType<typeof routeur>) {
  return spy.mock.calls.map(([u]) => decodeURIComponent(String(u))).filter((u) => u.includes('/api/commissions'));
}

beforeEach(() => {
  nav.query = '';
  nav.replace.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('CommissionsLedger — la vue dans l’URL (TCK-1732)', () => {
  it('ouvre la vue que porte l’URL', async () => {
    nav.query = 'status=paid&page=2';
    const spy = routeur();
    rendre();

    await waitFor(() => expect(appelsCommissions(spy).length).toBeGreaterThan(0));
    const url = appelsCommissions(spy)[0];
    expect(url).toContain('filter[status]=paid');
    expect(url).toContain('page=2');
    expect(screen.getByRole('button', { name: 'Payée' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignore un statut inconnu', async () => {
    nav.query = 'status=bidon';
    const spy = routeur();
    rendre();

    await waitFor(() => expect(appelsCommissions(spy).length).toBeGreaterThan(0));
    expect(appelsCommissions(spy)[0]).not.toContain('filter[status]');
  });

  it('écrit le statut choisi dans l’URL, et revient à la page 1', async () => {
    nav.query = 'status=paid&page=2';
    routeur();
    rendre();

    fireEvent.click(screen.getByRole('button', { name: 'Due' }));

    expect(nav.replace).toHaveBeenCalledWith('?status=due', { scroll: false });
  });

  it('écrit la page dans l’URL', async () => {
    routeur();
    rendre();

    fireEvent.click(await screen.findByRole('button', { name: /suivant/i }));

    expect(nav.replace).toHaveBeenCalledWith('?page=3', { scroll: false });
  });
});
