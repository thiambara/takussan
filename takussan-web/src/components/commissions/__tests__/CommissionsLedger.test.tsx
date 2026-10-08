/**
 * TCK-595 (ADR-0049 §3, AC13 côté écran) — le relevé des commissions.
 *
 * La portée est décidée par l'API ; l'écran ne doit offrir « Marquer payée » et « Annuler » qu'à qui
 * détient `payouts.approve`, et jamais sur la ligne dont il est le bénéficiaire (la policy la lui
 * refuse).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { CommissionsLedger } from '../CommissionsLedger';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 1 } }),
}));

const LIGNES = [
  {
    id: 11, agency_id: 3, lease_id: 50, beneficiary_id: 2, origin: 'negotiator', base_amount: 300000,
    share_percent: 30, amount: 90000, currency: 'XOF', status: 'due', earned_at: '2026-07-15T10:00:00Z',
    paid_at: null, cancelled_at: null,
    beneficiary: { id: 2, name: 'Awa Diop' }, lease: { id: 50, reference_number: 'BAIL-50', type: 'residential_rent' },
  },
  {
    id: 12, agency_id: 3, lease_id: 50, beneficiary_id: 1, origin: 'collaborator', base_amount: 300000,
    share_percent: 20, amount: 60000, currency: 'XOF', status: 'due', earned_at: '2026-07-15T10:00:00Z',
    paid_at: null, cancelled_at: null,
    beneficiary: { id: 1, name: 'Moi Même' }, lease: { id: 50, reference_number: 'BAIL-50', type: 'residential_rent' },
  },
];

function routeur(capacites: string[]) {
  const spy = vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entree);
    let corps: unknown = {};
    if (url.includes('/api/me/capabilities')) corps = { data: { agency_id: 3, capabilities: capacites } };
    else if (url.includes('/mark-paid')) corps = { data: { ...LIGNES[0], status: 'paid' } };
    else if (url.includes('/api/commissions')) {
      corps = {
        data: LIGNES,
        meta: { current_page: 1, last_page: 1, per_page: 20, total: 2, totals: { due: 150000, paid: 0, cancelled: 0 } },
      };
    }
    void init;
    return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function rendre() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}><CommissionsLedger /></QueryClientProvider>));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-595 — relevé des commissions', () => {
  it('lit le grand livre avec ses champs, et affiche les totaux par statut', async () => {
    const spy = routeur([]);
    rendre();

    await screen.findByText('Awa Diop');
    const url = spy.mock.calls.map(([u]) => String(u)).find((u) => u.includes('/api/commissions'))!;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('include')).toBe('lease,beneficiary');
    expect(params.get('fields[commission_entries]')).toContain('amount');
    expect(screen.getByText('Reste dû')).toBeInTheDocument();
    // Le total vient de `meta.totals` (toute la portée), pas de la somme de la page.
    expect(screen.getByText((_, el) => el?.textContent === '150\u202F000\u00A0F CFA')).toBeInTheDocument();
  });

  it('sans payouts.approve : aucun geste', async () => {
    routeur([]);
    rendre();

    await screen.findByText('Awa Diop');
    expect(screen.queryByRole('button', { name: 'Marquer payée' })).toBeNull();
  });

  it('avec payouts.approve : solder la ligne d’un autre, jamais la sienne', async () => {
    const spy = routeur(['payouts.approve']);
    rendre();

    const autre = (await screen.findByText('Awa Diop')).closest('tr')!;
    await waitFor(() => expect(within(autre).getByRole('button', { name: 'Marquer payée' })).toBeInTheDocument());
    const mienne = screen.getByText('Moi Même').closest('tr')!;
    expect(within(mienne).queryByRole('button', { name: 'Marquer payée' })).toBeNull();

    fireEvent.click(within(autre).getByRole('button', { name: 'Marquer payée' }));
    await waitFor(() =>
      expect(spy.mock.calls.some(([u, init]) => String(u).includes('/api/commissions/11/mark-paid') && init?.method === 'POST')).toBe(true),
    );
  });
});
