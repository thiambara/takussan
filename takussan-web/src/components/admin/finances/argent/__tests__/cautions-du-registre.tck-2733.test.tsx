/**
 * TCK-2733 (décision du porteur du 2026-11-11, option a) — le registre des encaissements garde les
 * cautions, que la tuile « Encaissé » exclut, et le dit : « dont cautions » sous la cellule de total
 * (bureau) et dans le récapitulatif du téléphone, seulement quand `meta.totals.deposits_amount > 0`.
 *
 * Même harnais que `argent.tck-2659.test.tsx` : la page entière, le réseau simulé.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminFinancesClient } from '@/app/(dashboard)/app/agency/finances/AdminFinancesClient';
import type { FinanceSummary } from '@/lib/queries/agency-reporting';
import { withIntl } from '@/test/intl';
import type { PaymentHistoryRow } from '@/types/invoice';

const { adresse, ecran, capacites } = vi.hoisted(() => {
  const ecouteurs = new Set<() => void>();
  const adresse = {
    valeur: '',
    ecouteurs,
    poser(qs: string) {
      adresse.valeur = qs;
      for (const e of ecouteurs) e();
    },
  };
  return { adresse, ecran: { telephone: false }, capacites: { accordees: new Set<string>() } };
});

vi.mock('next/navigation', async () => {
  const React = await import('react');
  const abonner = (e: () => void) => {
    adresse.ecouteurs.add(e);
    return () => adresse.ecouteurs.delete(e);
  };
  return {
    usePathname: () => '/app/agency/finances',
    useRouter: () => ({
      replace: (url: string) => act(() => adresse.poser(url.split('?')[1] ?? '')),
      push: vi.fn(),
      prefetch: vi.fn(),
    }),
    useSearchParams: () => {
      const qs = React.useSyncExternalStore(abonner, () => adresse.valeur);
      return React.useMemo(() => new URLSearchParams(qs), [qs]);
    },
  };
});
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton-de-test', user: null }) }));
vi.mock('@/hooks/useCan', () => ({ useCan: (c: string) => ({ can: capacites.accordees.has(c), isLoading: false }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => ecran.telephone }));
// Les tables des autres registres et les dialogues ont leurs propres tests.
vi.mock('@/components/payments/InvoicesTable', () => ({ InvoicesTable: () => null }));
vi.mock('@/components/payments/PayoutsTable', () => ({ PayoutsTable: () => null }));
vi.mock('@/components/payments/CreateInvoiceDialog', () => ({ CreateInvoiceDialog: () => null }));
vi.mock('@/components/payments/CreatePayoutDialog', () => ({ CreatePayoutDialog: () => null }));
vi.mock('@/components/payments/InvoiceDetailDialog', () => ({ InvoiceDetailDialog: () => null }));
vi.mock('@/components/payments/PayoutDetailDialog', () => ({ PayoutDetailDialog: () => null }));
vi.mock('@/components/admin/finances/OverduePaymentsTable', () => ({ OverduePaymentsTable: () => null }));

function synthese(partiel: Partial<FinanceSummary> = {}): FinanceSummary {
  return {
    period: '2026-11',
    as_of: '2026-11-11',
    currency: 'XOF',
    collected: { amount: 95_202_604, count: 69, previous_amount: 101_394_241 },
    overdue: {
      amount: 33_715_000,
      // 16 échéances sur 14 baux : la tuile compte les BAUX, la file d'« À faire » les échéances.
      count: 16,
      leases_count: 14,
      never_reminded_count: 5,
      by_age: { under_8: { amount: 1, count: 5 }, from_8_to_30: { amount: 1, count: 7 }, over_30: { amount: 1, count: 4 } },
    },
    deposits_held: 235_035_000,
    payouts_awaiting_approval: { amount: 0, count: 0, landlords_count: 0 },
    payouts_pending: { amount: 0, count: 0 },
    invoices_draft: { amount: 0, count: 0 },
    ...partiel,
  };
}

function ligne(partiel: Partial<PaymentHistoryRow>): PaymentHistoryRow {
  return {
    source: 'lease',
    id: 1,
    reference_number: 'LP-2026-0001',
    amount: 250_000,
    currency: 'XOF',
    payment_method: 'wave',
    payment_type: 'rent',
    status: 'paid',
    paid_amount: 250_000,
    remaining_amount: 0,
    date: '2026-11-07T00:00:00Z',
    paid_at: '2026-11-07T00:00:00Z',
    period_start: '2026-11-01',
    period_end: '2026-11-30',
    due_date: '2026-11-05',
    booking_id: null,
    lease_id: 3,
    property_id: 9,
    customer_id: 108,
    created_at: '2026-11-07T00:00:00Z',
    payer: { id: 108, name: 'Awa Diop', phone: null },
    property: { id: 9, title: 'Villa des Almadies', reference_number: 'P-9' },
    landlord: { id: 42, name: 'Moussa Sarr' },
    ...partiel,
  } as PaymentHistoryRow;
}


let totaux: Record<string, number> = {};

function repondre(corps: unknown) {
  return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps), headers: new Headers() };
}

function brancherLeReseau() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL) => {
      const url = new URL(String(entree), 'http://127.0.0.1:8002');
      if (url.pathname.endsWith('/finance/summary')) return repondre({ data: synthese() });
      if (url.pathname === '/api/payments/history') {
        const lignes = [ligne({}), ligne({ id: 2, payment_type: 'deposit', amount: 450_000, paid_amount: 450_000 })];
        return repondre({ data: lignes, meta: { current_page: 1, last_page: 1, per_page: 20, total: lignes.length, totals: totaux } });
      }
      return repondre({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
    }),
  );
}

function rendre(qs = 'tab=encaissements') {
  adresse.valeur = qs;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AdminFinancesClient canViewFinances canEmitFinances agencyId={1} />
      </QueryClientProvider>,
    ),
  );
}

/** La réponse de l'AC1 de l'API : 750 000 encaissés, dont 2 cautions pour 450 000. */
const AVEC_CAUTIONS = { count: 5, amount: 750_000, paid_amount: 750_000, remaining_amount: 0, deposits_count: 2, deposits_amount: 450_000 };
const SANS_CAUTION = { ...AVEC_CAUTIONS, deposits_count: 0, deposits_amount: 0 };
const ESPACE = '[\\s\\u00a0\\u202f]';

beforeEach(() => {
  totaux = AVEC_CAUTIONS;
  ecran.telephone = false;
  capacites.accordees = new Set(['invoices.create', 'payouts.create', 'payouts.approve', 'payments.export']);
  brancherLeReseau();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('la part des cautions dans les totaux du registre (TCK-2733)', () => {
  it('AC5 — la cellule de total dit « dont cautions » avec 450 000 et leur nombre', async () => {
    rendre();

    const mention = await screen.findByTestId('total-dont-cautions');
    expect(mention.textContent).toMatch(new RegExp(`^dont cautions 450${ESPACE}000${ESPACE}F${ESPACE}?\\(2\\)$`));
    // Sous la cellule « Total », pas ailleurs.
    expect(mention.parentElement?.textContent).toContain('Total');
  });

  it('AC5 — sans caution (`deposits_amount = 0`), la mention est absente', async () => {
    totaux = SANS_CAUTION;
    rendre();

    await screen.findByRole('table');
    expect(screen.queryByTestId('total-dont-cautions')).not.toBeInTheDocument();
    expect(screen.queryByText(/dont cautions/)).not.toBeInTheDocument();
  });

  it('une réponse sans les clés neuves (API d’avant) ne dit rien des cautions', async () => {
    totaux = { count: 5, amount: 750_000, paid_amount: 750_000, remaining_amount: 0 };
    rendre();

    await screen.findByRole('table');
    expect(screen.queryByText(/dont cautions/)).not.toBeInTheDocument();
  });

  it('téléphone — le récapitulatif dit « dont cautions 450 000 », et rien sans caution', async () => {
    ecran.telephone = true;
    const { unmount } = rendre();

    const resume = await screen.findByTestId('resume-cautions');
    expect(resume.textContent).toMatch(new RegExp(`dont cautions 450${ESPACE}000`));
    unmount();

    totaux = SANS_CAUTION;
    rendre();
    await waitFor(() => expect(screen.getByTestId('encaissements-agence')).toBeInTheDocument());
    expect(screen.queryByTestId('resume-cautions')).not.toBeInTheDocument();
  });
});
