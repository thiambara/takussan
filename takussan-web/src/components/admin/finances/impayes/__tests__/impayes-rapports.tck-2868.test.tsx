/**
 * TCK-2868 — les trois options de l'onglet « Impayés » de Rapports, sur LE composant d'« Argent » :
 *
 * - AC1 : au téléphone, la liste groupée par tranche, chaque groupe sous « > 90 j · 2 échéances » et son montant
 *   (le compte et le montant de la tranche entière, lus par les lectures des pastilles) ;
 * - AC2 : au bureau, « Tri : montant dû » envoie `sort=-remaining_amount`, et « Balance âgée en PDF » télécharge
 *   `GET /api/agencies/{agence}/finance/aging.pdf` ;
 * - « Argent » ne les a pas.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PaymentHistoryRow } from '@/types/invoice';

const reseau = vi.hoisted(() => ({ appels: [] as string[] }));

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: vi.fn() }) }));
vi.mock('@/context/AuthContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/context/AuthContext')>()),
  useAuth: () => ({ token: 'jeton', user: { id: 9, agency_id: 1 } }),
}));
vi.mock('@/hooks/useProfiles', () => ({ useMyProfiles: () => ({ data: undefined, isLoading: false }) }));
vi.mock('@/components/leases/LeasePaymentDialog', () => ({ LeasePaymentDialog: () => null }));

function ligne(id: number, jours: number, extra: Partial<PaymentHistoryRow> = {}): PaymentHistoryRow {
  return {
    source: 'lease',
    id,
    reference_number: `LP-${id}`,
    amount: 250_000,
    currency: 'XOF',
    payment_method: null,
    payment_type: 'rent',
    status: 'late',
    paid_amount: 0,
    remaining_amount: 250_000,
    amount_due: 250_000,
    late_fee_amount: null,
    date: '2026-10-01T00:00:00Z',
    paid_at: null,
    period_start: '2026-10-01',
    period_end: '2026-10-31',
    due_date: '2026-10-07',
    booking_id: null,
    lease_id: 100 + id,
    property_id: 200 + id,
    customer_id: 300 + id,
    created_at: '2026-09-01T00:00:00Z',
    days_late: jours,
    payer: { id: 300 + id, name: `Locataire ${id}`, phone: '+221771234567', first_name: `Prénom${id}`, locale: null },
    property: { id: 200 + id, title: `Studio ${id}`, reference_number: null },
    landlord: { id: 50, name: 'Mme Seck' },
    last_reminder: null,
    reminders_count: 0,
    ...extra,
  } as PaymentHistoryRow;
}

// Dans l'ordre de l'API (`sort=-days_late`) : > 90 j, 31–60 j, 1–30 j.
const LIGNES = [
  ligne(3, 104, { remaining_amount: 900_000 }),
  ligne(4, 95, { remaining_amount: 300_000 }),
  ligne(2, 41),
  ligne(1, 12),
  ligne(5, 5, { remaining_amount: 100_000 }),
];

vi.mock('@/lib/api', async (importOriginal) => {
  const reel = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...reel,
    apiRequest: async (chemin: string) => {
      reseau.appels.push(chemin);
      const url = new URL(chemin, 'http://api.test');
      if (url.pathname === '/api/payments/history') {
        const min = Number(url.searchParams.get('filter[days_late_min]') ?? 0);
        const max = Number(url.searchParams.get('filter[days_late_max]') ?? Infinity);
        const parPage = Number(url.searchParams.get('per_page') ?? 20);
        const tri = LIGNES.filter((l) => (l.days_late ?? 0) >= min && (l.days_late ?? 0) <= max);
        return {
          data: tri.slice(0, parPage),
          meta: {
            current_page: 1,
            last_page: 1,
            per_page: parPage,
            total: tri.length,
            from: 1,
            to: 1,
            totals: { count: tri.length, amount: 0, paid_amount: 0, remaining_amount: tri.reduce((s, l) => s + l.remaining_amount, 0) },
          },
        };
      }
      if (url.pathname === '/api/agencies/1/finance/aging') {
        return {
          data: {
            as_of: '2026-11-10',
            group_by: url.searchParams.get('group_by'),
            buckets: {
              '1_30': { count: 9, amount: 11_965_000 },
              '31_60': { count: 4, amount: 8_100_000 },
              '61_90': { count: 0, amount: 0 },
              '90_plus': { count: 3, amount: 13_650_000 },
            },
            total: { count: 16, amount: 33_715_000 },
            // TCK-2868 — par bailleur : la liste de « Tous les bailleurs ».
            rows:
              url.searchParams.get('group_by') === 'landlord'
                ? [{ id: 50, name: 'Mme Seck', buckets: {}, total: { count: 5, amount: 1_800_000 } }]
                : [],
            deposits_held: { total: 0, by_landlord: [] },
          },
        };
      }
      throw new Error(`requête inattendue : ${chemin}`);
    },
  };
});

const { Impayes } = await import('../Impayes');
const { OngletImpayes } = await import('@/components/rapports/vues/OngletImpayes');

function bureau(actif: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: actif && /64rem|80rem/.test(query),
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function rendre(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utilisateur = userEvent.setup();
  render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
  return utilisateur;
}

const historiques = () =>
  reseau.appels.filter((a) => a.startsWith('/api/payments/history')).map((a) => new URL(a, 'http://api.test').searchParams);


const fetchSpy = vi.fn(async (_url: string) => new Response('%PDF', { status: 200 }));

beforeEach(() => {
  reseau.appels.length = 0;
  bureau(true);
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const enTetes = () =>
  [...document.querySelectorAll('[data-slot="en-tete-de-tranche"]')].map((h) => (h.textContent ?? '').replace(/\s+/gu, ' '));

describe('TCK-2868 — Impayés de Rapports : groupes, tri et PDF', () => {
  it('AC1 — au téléphone, les échéances sont groupées sous l’en-tête de leur tranche : compte et montant', async () => {
    bureau(false);
    rendre(<OngletImpayes agencyId={1} />);
    await screen.findByText('Locataire 5');
    await waitFor(() => expect(enTetes()).toEqual(['> 90 j · 2 échéances1 200 000 F', '31–60 j · 1 échéance250 000 F', '1–30 j · 2 échéances350 000 F']));
    // L'en-tête précède la première échéance de sa tranche, et elle seule.
    const liste = document.querySelector('[data-slot="liste-impayes"]') as HTMLElement;
    const ordre = [...liste.children].map((n) => n.getAttribute('data-tranche') ?? (n.textContent?.match(/Locataire \d/)?.[0] ?? '?'));
    expect(ordre).toEqual(['plus90', 'Locataire 3', 'Locataire 4', 'de31a60', 'Locataire 2', 'de1a30', 'Locataire 1', 'Locataire 5']);
  });

  it('AC2 — au bureau, « Tri : montant dû » relit la liste triée par `sort=-remaining_amount`', async () => {
    const u = rendre(<OngletImpayes agencyId={1} />);
    await screen.findByText('Locataire 1');
    expect(screen.getByRole('heading', { name: '5 échéances en retard' })).toBeInTheDocument();
    expect(historiques().filter((p) => p.get('per_page') === '20').every((p) => p.get('sort') === '-days_late')).toBe(true);
    await u.click(screen.getByRole('combobox', { name: 'Trier les impayés' }));
    await u.click(await screen.findByRole('option', { name: 'Tri : montant dû' }));
    await waitFor(() => expect(historiques().some((p) => p.get('per_page') === '20' && p.get('sort') === '-remaining_amount')).toBe(true));
    // Les comptes des pastilles ne dépendent pas de l'ordre : aucun n'est relu trié.
    expect(historiques().filter((p) => p.get('per_page') === '1').every((p) => p.get('sort') === '-days_late')).toBe(true);
    // Au bureau, pas d'en-tête de tranche : le tableau a ses colonnes.
    expect(enTetes()).toEqual([]);
  });

  it('AC2 — « Balance âgée en PDF » télécharge `finance/aging.pdf` de l’agence', async () => {
    const ancre = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const u = rendre(<OngletImpayes agencyId={1} />);
    await screen.findByText('Locataire 1');
    await u.click(screen.getByRole('button', { name: 'Balance âgée en PDF' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(String(fetchSpy.mock.calls[0]![0])).toMatch(/\/api\/agencies\/1\/finance\/aging\.pdf$/);
    await waitFor(() => expect(ancre).toHaveBeenCalled());
    expect((ancre.mock.contexts[0] as HTMLAnchorElement).download).toBe('balance-agee.pdf');
  });

  it('« Tous les bailleurs » filtre la liste ET le PDF sur le bailleur choisi', async () => {
    const u = rendre(<OngletImpayes agencyId={1} />);
    await screen.findByText('Locataire 1');
    await u.click(screen.getByRole('combobox', { name: 'Filtrer par bailleur' }));
    await u.click(await screen.findByRole('option', { name: 'Mme Seck' }));
    await waitFor(() => expect(historiques().some((p) => p.get('per_page') === '20' && p.get('filter[landlord_id]') === '50')).toBe(true));
    // Le sélecteur dit le filtre : pas de puce « Bailleur : … » en double au bureau.
    expect(screen.queryByRole('button', { name: /Retirer le filtre du bailleur/ })).toBeNull();
    await u.click(screen.getByRole('button', { name: 'Balance âgée en PDF' }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(decodeURIComponent(String(fetchSpy.mock.calls.at(-1)![0]))).toMatch(/\/finance\/aging\.pdf\?filter\[landlord_id\]=50$/);
  });

  it('« Argent » n’a ni groupes, ni tri, ni PDF', async () => {
    rendre(<Impayes agencyId={1} />);
    await screen.findByText('Locataire 1');
    expect(screen.queryByRole('button', { name: 'Balance âgée en PDF' })).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Trier les impayés' })).toBeNull();
    bureau(false);
  });

  it('« Argent » au téléphone : pas d’en-tête de tranche', async () => {
    bureau(false);
    rendre(<Impayes agencyId={1} />);
    await screen.findByText('Locataire 5');
    expect(enTetes()).toEqual([]);
  });
});
