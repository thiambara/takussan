/**
 * TCK-595 (AC18, côté écran) — l'onglet « Impayés » de `/admin/finances` est la balance âgée.
 *
 * Le jeu simulé est celui d'AC18 : quatre loyers de 100 000 échus de 10, 40, 75 et 120 jours, tous
 * au statut `pending`. L'onglet épinglait `filter[status]=late` sur l'historique des paiements, et
 * rendait 0 ligne sur ce jeu quand la tuile « Impayés » en comptait 4 pour 400 000.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { OverduePaymentsTable } from '../OverduePaymentsTable';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: { id: 1, agency_id: 3 } }),
}));

const CENT_MILLE = { count: 1, amount: 100000 };
const VIDE = { count: 0, amount: 0 };

function balance(groupBy: 'tenant' | 'landlord') {
  return {
    data: {
      as_of: '2026-07-15',
      group_by: groupBy,
      buckets: { '1_30': CENT_MILLE, '31_60': CENT_MILLE, '61_90': CENT_MILLE, '90_plus': CENT_MILLE },
      total: { count: 4, amount: 400000 },
      rows: [
        {
          id: 21,
          name: groupBy === 'tenant' ? 'Fatou Sall' : 'Moussa Ndiaye',
          buckets: { '1_30': CENT_MILLE, '31_60': CENT_MILLE, '61_90': VIDE, '90_plus': VIDE },
          total: { count: 2, amount: 200000 },
        },
        {
          id: 22,
          name: groupBy === 'tenant' ? 'Ibou Faye' : 'Aïda Ba',
          buckets: { '1_30': VIDE, '31_60': VIDE, '61_90': CENT_MILLE, '90_plus': CENT_MILLE },
          total: { count: 2, amount: 200000 },
        },
      ],
      deposits_held: { total: 50000, by_landlord: [{ landlord_id: 9, name: 'Moussa Ndiaye', amount: 50000 }] },
    },
  };
}

function mockFetch() {
  const spy = vi.fn(async (entree: RequestInfo | URL) => {
    const url = String(entree);
    const corps = balance(url.includes('group_by=landlord') ? 'landlord' : 'tenant');
    return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps) };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderTable() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <OverduePaymentsTable />
      </QueryClientProvider>,
    ),
  );
}

/**
 * La tuile dont le libellé est `libelle` : son texte entier. Les espaces insécables de
 * `formatCurrency` (U+202F, U+00A0) se comparent tels quels.
 */
function tuile(libelle: string): string {
  const etiquette = screen.getAllByText(libelle).find((el) => el.tagName === 'P');
  return etiquette?.parentElement?.parentElement?.textContent ?? '';
}

const F_100K = '100 000 F CFA';
const F_400K = '400 000 F CFA';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TCK-595 — onglet Impayés : la balance âgée (AC18)', () => {
  it('vise /finance/aging de l’agence, et ne porte plus filter[status]=late', async () => {
    const spy = mockFetch();
    renderTable();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const url = String(spy.mock.calls[0]![0]);
    expect(url).toContain('/api/agencies/3/finance/aging');
    expect(url).toContain('group_by=tenant');
    expect(url).not.toContain('payments/history');
    expect(decodeURIComponent(url)).not.toContain('filter[status]=late');
  });

  it('affiche les quatre tranches à 100 000 F CFA et un total de 400 000 F CFA', async () => {
    mockFetch();
    renderTable();

    await screen.findByText('Fatou Sall');
    for (const tranche of ['1 à 30 jours', '31 à 60 jours', '61 à 90 jours', 'Plus de 90 jours']) {
      expect(tuile(tranche)).toContain(F_100K);
    }
    expect(tuile('Total des impayés')).toContain(F_400K);
    expect(tuile('Cautions détenues')).toContain('50 000 F CFA');
    expect(screen.getByRole('link', { name: 'Fatou Sall' })).toHaveAttribute('href', '/app/customers/21');
  });

  it('regroupe par bailleur à la demande', async () => {
    const spy = mockFetch();
    renderTable();

    fireEvent.click(await screen.findByRole('button', { name: 'Par bailleur' }));

    await screen.findByText('Aïda Ba');
    expect(spy.mock.calls.some(([u]) => String(u).includes('group_by=landlord'))).toBe(true);
    expect(screen.getByRole('columnheader', { name: 'Bailleur' })).toBeInTheDocument();
  });
});
