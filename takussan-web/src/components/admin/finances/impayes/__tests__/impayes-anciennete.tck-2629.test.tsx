/**
 * TCK-2629 — l'onglet « Impayés » de Rapports monte LE composant d'« Argent » (ADR-0096 § 5), avec deux
 * propriétés : les tranches d'ancienneté de la balance âgée (1–30 · 31–60 · 61–90 · > 90 j), qui filtrent
 * la liste par `filter[days_late_min/max]`, et « jamais relancé » en ton d'alerte. « Argent » reste tel quel.
 *
 * Le réseau est un faux serveur derrière `apiRequest` : chaque requête est relevée (AC4, « paramètres vus
 * au réseau »).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const LIGNES = [
  ligne(1, 12),
  ligne(2, 41, { last_reminder: { at: '2026-11-02T09:00:00Z', source: 'manual', channel: 'whatsapp' } as PaymentHistoryRow['last_reminder'] }),
  ligne(3, 104),
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
            rows: [],
            deposits_held: { total: 0, by_landlord: [] },
          },
        };
      }
      throw new Error(`requête inattendue : ${chemin}`);
    },
  };
});

const { Impayes } = await import('../Impayes');

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

beforeEach(() => {
  reseau.appels.length = 0;
  bureau(true);
});

describe('TCK-2629 — Impayés de Rapports : les tranches d’ancienneté', () => {
  it('AC4 — la tranche « 31–60 j » de la balance âgée filtre la liste sur 31 à 60 jours (réseau)', async () => {
    const u = rendre(<Impayes agencyId={1} resume="toujours" tranches="anciennete" jamaisRelanceEnAlerte />);
    const balance = await screen.findByRole('list', { name: 'Ancienneté des impayés' });
    const tranche = within(balance).getByRole('button', { name: /31–60 j de retard/ });
    expect(tranche).toHaveTextContent(/4 échéances/);
    expect(tranche).toHaveAttribute('aria-pressed', 'false');
    await u.click(tranche);
    expect(tranche).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() =>
      expect(
        historiques().some((p) => p.get('filter[days_late_min]') === '31' && p.get('filter[days_late_max]') === '60' && p.get('per_page') === '20'),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByText('Locataire 2')).toBeInTheDocument());
    expect(screen.queryByText('Locataire 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Locataire 3')).not.toBeInTheDocument();
  });

  it('les pastilles sont celles de l’ancienneté, chacune comptée par sa propre lecture légère', async () => {
    rendre(<Impayes agencyId={1} resume="toujours" tranches="anciennete" jamaisRelanceEnAlerte />);
    const puces = await screen.findByRole('group', { name: 'Retard' });
    // Le libellé est le premier nœud de la puce ; le compte suit dans son propre `span`.
    expect(within(puces).getAllByRole('button').map((b) => b.childNodes[0]?.textContent)).toEqual(['Tous', '1–30 j', '31–60 j', '61–90 j', '> 90 j']);
    await waitFor(() => {
      const bornes = historiques().filter((p) => p.get('per_page') === '1').map((p) => `${p.get('filter[days_late_min]')}-${p.get('filter[days_late_max]') ?? ''}`);
      expect(new Set(bornes)).toEqual(new Set(['1-30', '31-60', '61-90', '91-']));
    });
  });

  it('« jamais relancé » en ton d’alerte dans Rapports ; une échéance relancée garde sa date', async () => {
    rendre(<Impayes agencyId={1} resume="toujours" tranches="anciennete" jamaisRelanceEnAlerte />);
    await screen.findByText('Locataire 1');
    const jamais = screen.getAllByText('jamais relancé');
    expect(jamais.length).toBe(2);
    for (const j of jamais) expect(j).toHaveClass('text-destructive');
  });

  it('« Argent » est inchangé : ses tranches, et « jamais relancé » en gris, sans balance âgée', async () => {
    rendre(<Impayes agencyId={1} />);
    await screen.findByText('Locataire 1');
    for (const j of screen.getAllByText('jamais relancé')) {
      expect(j).not.toHaveClass('text-destructive');
      expect(j).toHaveClass('text-muted-foreground');
    }
    expect(screen.queryByRole('list', { name: 'Ancienneté des impayés' })).not.toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Retard' })).getByRole('button', { name: /Plus de 30 j/ })).toBeInTheDocument();
  });

  it('au téléphone, la carte dit « jamais relancé » en ton d’alerte dans Rapports', async () => {
    bureau(false);
    rendre(<Impayes agencyId={1} resume="toujours" tranches="anciennete" jamaisRelanceEnAlerte />);
    await screen.findByText('Locataire 1');
    const jamais = screen.getAllByText('jamais relancé');
    expect(jamais.length).toBeGreaterThan(0);
    for (const j of jamais) expect(j).toHaveClass('text-destructive');
  });
});
