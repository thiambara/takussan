/**
 * TCK-2659 — « Argent » (`/app/agency/finances`) : le point du mois et le registre nommé.
 *
 * La page est rendue ENTIÈRE (point du mois, registres, filtres) ; seul le réseau est simulé, par un
 * `fetch` qui répond selon le chemin et garde chaque URL. L'adresse est un vrai état : `replace()`
 * la change et la page se rend de nouveau, comme sous Next.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminFinancesClient } from '@/app/(dashboard)/app/agency/finances/AdminFinancesClient';
import { parametresDesEncaissements } from '@/components/admin/finances/argent/EncaissementsAgence';
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

let reponseSynthese: FinanceSummary = synthese();
let lignes: PaymentHistoryRow[] = [];
let bailleurs: unknown[] = [];
let reversements: unknown[] = [];
/** M1 — le faux serveur borne comme l'API : `filter[paid_from|paid_to]` sur `paid_at` seul, `filter[date_from|date_to]`
 * sur `paid_at` OU `period_start`, et `filter[status]`. */
let serveurBorneParEncaissement = false;
const appels: URL[] = [];

/** Les `meta.totals` de l'API : les sommes des seules lignes servies. */
function sommes(rows: readonly PaymentHistoryRow[]) {
  const somme = (f: (r: PaymentHistoryRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  return { count: rows.length, amount: somme((r) => Number(r.amount)), paid_amount: somme((r) => Number(r.paid_amount ?? 0)), remaining_amount: somme((r) => Number(r.remaining_amount ?? 0)) };
}

function repondre(corps: unknown) {
  return { ok: true, status: 200, json: async () => corps, text: async () => JSON.stringify(corps), headers: new Headers() };
}

function brancherLeReseau() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL) => {
      const url = new URL(String(entree), 'http://127.0.0.1:8002');
      appels.push(url);
      if (url.pathname.endsWith('/finance/summary')) return repondre({ data: reponseSynthese });
      if (url.pathname === '/api/payments/history') {
        const p = (nom: string) => url.searchParams.get(`filter[${nom}]`);
        const dans = (jour: string | null | undefined, de: string | null, a: string | null) => !!jour && (!de || jour.slice(0, 10) >= de) && (!a || jour.slice(0, 10) <= a);
        const servies = serveurBorneParEncaissement
          ? lignes.filter(
              (l) =>
                (!p('status') || l.status === p('status')) &&
                (!(p('paid_from') || p('paid_to')) || dans(l.paid_at, p('paid_from'), p('paid_to'))) &&
                (!(p('date_from') || p('date_to')) || dans(l.paid_at, p('date_from'), p('date_to')) || dans(l.period_start, p('date_from'), p('date_to'))),
            )
          : lignes;
        return repondre({
          data: servies,
          meta: { current_page: 1, last_page: 1, per_page: 20, total: servies.length, totals: serveurBorneParEncaissement ? sommes(servies) : { count: servies.length, amount: 0, paid_amount: 0, remaining_amount: 0 } },
        });
      }
      if (url.pathname === '/api/payouts') return repondre({ data: reversements, meta: { current_page: 1, last_page: 1, per_page: 3, total: reversements.length } });
      if (url.pathname === '/api/owners') return repondre({ data: bailleurs, meta: { current_page: 1, last_page: 1, per_page: 20, total: bailleurs.length } });
      return repondre({ data: [], meta: { current_page: 1, last_page: 1, per_page: 20, total: 0 } });
    }),
  );
}

/** Les lectures de la LISTE du registre (pas ses totaux à `per_page=1`, ni les cartes du point). */
const lecturesDeLaListe = () =>
  appels.filter((u) => u.pathname === '/api/payments/history' && u.searchParams.get('per_page') === '20' && u.searchParams.get('include')?.includes('landlord'));

function rendre(qs = '') {
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

beforeEach(() => {
  appels.length = 0;
  reponseSynthese = synthese();
  lignes = [];
  bailleurs = [];
  reversements = [];
  serveurBorneParEncaissement = false;
  ecran.telephone = false;
  capacites.accordees = new Set(['invoices.create', 'payouts.create', 'payouts.approve', 'payments.export']);
  brancherLeReseau();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('le point du mois (TCK-2659)', () => {
  it('AC2 — « Octobre 2026 » demande la synthèse d’octobre et nomme la tuile « Encaissé en octobre »', async () => {
    rendre('period=2026-10');

    expect(await screen.findByText('Encaissé en octobre')).toBeInTheDocument();
    const lectures = appels.filter((u) => u.pathname === '/api/agencies/1/finance/summary');
    expect(lectures.length).toBeGreaterThan(0);
    expect(lectures.every((u) => u.searchParams.get('period') === '2026-10')).toBe(true);
    // Le mois suit les liens des tuiles : le registre ouvert garde octobre.
    expect(screen.getByText('Encaissé en octobre').closest('a')).toHaveAttribute('href', '/app/agency/finances?tab=encaissements&period=2026-10');
  });

  it('AC7 — l’impayé se compte en « baux », jamais en « bails »', async () => {
    rendre();

    expect(await screen.findByText(/14 baux · 4 de plus de 30 jours/)).toBeInTheDocument();
    expect(screen.queryByText(/bails/)).not.toBeInTheDocument();
  });

  it('AC7 (téléphone) — « 14 baux en retard » (les baux) et « 16 impayés à relancer » (les échéances)', async () => {
    ecran.telephone = true;
    rendre();

    expect(await screen.findByText('14 baux en retard')).toBeInTheDocument();
    expect(screen.getByText('16 impayés à relancer')).toBeInTheDocument();
  });

  it('AC3 — « 3 reversements à approuver » ouvre la file `?tab=a-approuver`', async () => {
    ecran.telephone = true;
    reponseSynthese = synthese({ payouts_awaiting_approval: { amount: 4_200_000, count: 3, landlords_count: 3 } });
    rendre();

    const lien = (await screen.findByText('3 reversements à approuver')).closest('a');
    expect(lien).toHaveAttribute('href', '/app/agency/finances?tab=a-approuver');
  });

  it('AC3 — sans payouts.approve, la ligne n’existe pas', async () => {
    ecran.telephone = true;
    capacites.accordees.delete('payouts.approve');
    reponseSynthese = synthese({ payouts_awaiting_approval: { amount: 4_200_000, count: 3, landlords_count: 3 } });
    rendre();

    expect(await screen.findByText('16 impayés à relancer')).toBeInTheDocument();
    expect(screen.queryByText('3 reversements à approuver')).not.toBeInTheDocument();
    expect(screen.queryByText('À approuver')).not.toBeInTheDocument();
  });

  it('une file vide n’a pas de ligne dans « À faire » (aucune facture à émettre)', async () => {
    ecran.telephone = true;
    rendre();

    expect(await screen.findByText('16 impayés à relancer')).toBeInTheDocument();
    expect(screen.queryByText(/factures? à émettre/)).not.toBeInTheDocument();
  });
});

describe('le registre des encaissements (TCK-2659)', () => {
  it('AC4 — une ligne nomme le locataire, le bien, la période et le moyen ; la référence vient en dernière colonne', async () => {
    lignes = [ligne({}), ligne({ id: 2, reference_number: 'LP-2026-0002', period_start: '2026-10-01', payment_method: 'cash', payer: { id: 7, name: 'Fatou Ndiaye', phone: null } })];
    rendre('tab=encaissements');

    const table = await screen.findByRole('table');
    const rangees = within(table).getAllByRole('row');
    const premiere = rangees[1];
    expect(within(premiere).getByText('Awa Diop')).toBeInTheDocument();
    expect(within(premiere).getByText('Villa des Almadies')).toBeInTheDocument();
    expect(within(premiere).getByText('Loyer de novembre')).toBeInTheDocument();
    expect(within(premiere).getByText('Wave')).toBeInTheDocument();
    expect(within(rangees[2]).getByText('Loyer d’octobre')).toBeInTheDocument();

    const entetes = within(rangees[0]).getAllByRole('columnheader').map((c) => c.textContent);
    expect(entetes[0]).toBe('Payeur');
    expect(entetes[entetes.length - 1]).toBe('Référence');
    expect(screen.queryByText(/Bail #/)).not.toBeInTheDocument();
  });

  it('AC5 — « diop » tapé part en UNE lecture `filter[search]=diop`, sans les frappes intermédiaires', async () => {
    const user = userEvent.setup();
    rendre('tab=encaissements');
    await waitFor(() => expect(lecturesDeLaListe().length).toBeGreaterThan(0));

    await user.type(screen.getByRole('searchbox', { name: /Chercher un locataire/ }), 'diop');

    await waitFor(() => expect(lecturesDeLaListe().some((u) => u.searchParams.get('filter[search]') === 'diop')).toBe(true));
    const cherchees = lecturesDeLaListe().filter((u) => u.searchParams.has('filter[search]'));
    expect(cherchees.map((u) => u.searchParams.get('filter[search]'))).toEqual(['diop']);
    expect(adresse.valeur).toContain('q=diop');
  });

  it('AC5 — un bailleur choisi filtre par `filter[landlord_id]` (son compte, pas son profil)', async () => {
    const user = userEvent.setup();
    bailleurs = [{ id: 5, user_id: 42, agency_id: 1, status: 'active', metadata: { first_name: 'Moussa', last_name: 'Sarr' }, user: { id: 42, first_name: 'Moussa', last_name: 'Sarr' } }];
    rendre('tab=encaissements');

    await user.click(await screen.findByRole('button', { name: 'Bailleur' }));
    await user.click(await screen.findByRole('button', { name: /Moussa Sarr/ }));

    await waitFor(() => expect(lecturesDeLaListe().some((u) => u.searchParams.get('filter[landlord_id]') === '42')).toBe(true));
    expect(adresse.valeur).toContain('landlord_id=42');
    expect(appels.some((u) => u.pathname === '/api/owners' && u.searchParams.get('filter[agency_id]') === '1')).toBe(true);
  });

  it('AC6 — `?tab=encaissements&entity_type=lease&entity_id=3` ne lit que le bail 3, sans borne de mois', async () => {
    rendre('tab=encaissements&entity_type=lease&entity_id=3');

    await waitFor(() => expect(lecturesDeLaListe().length).toBeGreaterThan(0));
    for (const u of lecturesDeLaListe()) {
      expect(u.searchParams.get('filter[entity_type]')).toBe('lease');
      expect(u.searchParams.get('filter[entity_id]')).toBe('3');
      expect(u.searchParams.has('filter[date_from]')).toBe(false);
      expect(u.searchParams.has('filter[paid_from]')).toBe(false);
    }
  });

  it('AC6 — le lien d’entité seul (sans `tab`) ouvre aussi le registre', async () => {
    rendre('entity_type=lease&entity_id=3');

    await waitFor(() => expect(lecturesDeLaListe().length).toBeGreaterThan(0));
    expect(lecturesDeLaListe().every((u) => u.searchParams.get('filter[entity_id]') === '3')).toBe(true);
    expect(screen.queryByTestId('tuiles-du-mois')).not.toBeInTheDocument();
  });
});

describe('vérification adverse de TCK-2659', () => {
  /** Le lien d'export, lu sur son nom accessible : il dit ce qui part et pour quelles bornes. */
  const bornesDuLien = (lien: HTMLElement) => {
    const url = new URL(lien.getAttribute('href') ?? '', 'http://127.0.0.1:3000');
    return { from: url.searchParams.get('from'), to: url.searchParams.get('to'), chemin: url.pathname };
  };

  it('R1 — l’export du mois choisi (`?period=2026-10`) part du 1ᵉʳ au 31 octobre, et dit « loyers dus », jamais « encaissements »', async () => {
    rendre('tab=encaissements&period=2026-10');

    const lien = await screen.findByRole('link', { name: 'Exporter les loyers dus en octobre (CSV)' });
    expect(bornesDuLien(lien)).toEqual({ from: '2026-10-01', to: '2026-10-31', chemin: '/api/export/payments' });
    expect(screen.queryByRole('link', { name: /encaissements/i })).not.toBeInTheDocument();
  });

  it('R1 — des dates posées l’emportent sur le mois, et le nom accessible les dit', async () => {
    rendre('tab=encaissements&period=2026-10&date_from=2026-01-01&date_to=2026-03-31');

    const lien = await screen.findByRole('link', { name: 'Exporter les loyers dus du 1 janvier 2026 au 31 mars 2026 (CSV)' });
    expect(bornesDuLien(lien)).toMatchObject({ from: '2026-01-01', to: '2026-03-31' });
  });

  it('R1 (téléphone) — la ligne du point du mois dit « Exporter les loyers dus », pour le mois affiché', async () => {
    ecran.telephone = true;
    rendre('period=2026-10');

    const titre = await screen.findByText('Exporter les loyers dus');
    expect(screen.getByText('Les échéances du mois affiché, en CSV')).toBeInTheDocument();
    expect(bornesDuLien(titre.closest('a') as HTMLElement)).toMatchObject({ from: '2026-10-01', to: '2026-10-31' });
    expect(screen.queryByText(/Exporter les encaissements/)).not.toBeInTheDocument();
  });

  it('M1 — le loyer d’octobre réglé le 3 novembre est un encaissement de novembre, pas d’octobre', async () => {
    serveurBorneParEncaissement = true;
    lignes = [ligne({ id: 5, period_start: '2026-10-01', period_end: '2026-10-31', due_date: '2026-10-05', paid_at: '2026-11-03T10:00:00Z', date: '2026-11-03T10:00:00Z' })];

    const novembre = rendre('tab=encaissements&period=2026-11');
    expect(await screen.findByText('Loyer d’octobre')).toBeInTheDocument();
    for (const u of lecturesDeLaListe()) {
      expect(u.searchParams.get('filter[paid_from]')).toBe('2026-11-01');
      expect(u.searchParams.get('filter[paid_to]')).toBe('2026-11-30');
      expect(u.searchParams.has('filter[date_from]')).toBe(false);
    }
    novembre.unmount();

    rendre('tab=encaissements&period=2026-10');
    // 0 se dit au singulier en français (« 0 paiement ») : l'état vide est le signal sans ambiguïté.
    expect(await screen.findByText('Aucun encaissement')).toBeInTheDocument();
    expect(screen.queryByText('Loyer d’octobre')).not.toBeInTheDocument();
  });

  it('M1 — « Derniers encaissements » (bureau) se borne aussi par `paid_at`', async () => {
    rendre('period=2026-10');

    expect(await screen.findByText('Derniers encaissements')).toBeInTheDocument();
    await waitFor(() => expect(appels.some((u) => u.pathname === '/api/payments/history' && u.searchParams.get('filter[status]') === 'paid')).toBe(true));
    const derniers = appels.filter((u) => u.pathname === '/api/payments/history' && u.searchParams.get('filter[status]') === 'paid');
    for (const u of derniers) {
      expect(u.searchParams.get('filter[paid_from]')).toBe('2026-10-01');
      expect(u.searchParams.get('filter[paid_to]')).toBe('2026-10-31');
      expect(u.searchParams.has('filter[date_from]')).toBe(false);
    }
  });

  it('D2 — « En retard » en novembre rend les 9 échéances en retard du mois (bornes de l’échéance, pas de l’encaissement)', async () => {
    serveurBorneParEncaissement = true;
    const enRetard = Array.from({ length: 9 }, (_, i) =>
      ligne({ id: 100 + i, reference_number: `LP-2026-01${i}`, status: 'late', paid_at: null, paid_amount: 0, remaining_amount: 250_000, period_start: '2026-11-01', period_end: '2026-11-30', due_date: '2026-11-05', payer: { id: 200 + i, name: `Locataire ${i + 1}`, phone: null } }),
    );
    lignes = [...enRetard, ligne({ id: 99, status: 'paid' }), ligne({ id: 98, status: 'late', paid_at: null, period_start: '2026-10-01', period_end: '2026-10-31', due_date: '2026-10-05' })];
    rendre('tab=encaissements&period=2026-11&status=late');

    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getAllByRole('row')).toHaveLength(1 + 9));
    expect(within(table).getByText('Locataire 9')).toBeInTheDocument();
    for (const u of lecturesDeLaListe()) {
      expect(u.searchParams.get('filter[status]')).toBe('late');
      expect(u.searchParams.get('filter[date_from]')).toBe('2026-11-01');
      expect(u.searchParams.get('filter[date_to]')).toBe('2026-11-30');
      expect(u.searchParams.has('filter[paid_from]')).toBe(false);
    }
  });

  it('D2 — sous « Payé », le registre reste borné par l’encaissement', async () => {
    rendre('tab=encaissements&period=2026-11&status=paid');

    await waitFor(() => expect(lecturesDeLaListe().length).toBeGreaterThan(0));
    for (const u of lecturesDeLaListe()) {
      expect(u.searchParams.get('filter[paid_from]')).toBe('2026-11-01');
      expect(u.searchParams.has('filter[date_from]')).toBe(false);
    }
  });

  /** La cellule de la bande des totaux qui porte ce libellé (libellé, valeur, détail). */
  const celluleDeTotal = (libelle: string) => screen.getByText(libelle, { selector: 'p' }).parentElement as HTMLElement;
  const lecturesDeLaBande = (statut: string | null) =>
    appels.filter((u) => u.pathname === '/api/payments/history' && u.searchParams.get('per_page') === '1' && u.searchParams.get('filter[status]') === statut);

  it('N1 — « Échoué » lit les paiements échoués par l’échéance du mois (date_*), jamais par l’encaissement', async () => {
    serveurBorneParEncaissement = true;
    lignes = [
      ligne({ id: 300, status: 'paid' }),
      ligne({ id: 301, status: 'failed', paid_at: null, paid_amount: 0, remaining_amount: 250_000, period_start: '2026-11-01', due_date: '2026-11-05' }),
    ];
    rendre('tab=encaissements&period=2026-11');

    await waitFor(() => expect(lecturesDeLaBande('failed').length).toBeGreaterThan(0));
    for (const u of lecturesDeLaBande('failed')) {
      expect(u.searchParams.get('filter[date_from]')).toBe('2026-11-01');
      expect(u.searchParams.get('filter[date_to]')).toBe('2026-11-30');
      expect(u.searchParams.has('filter[paid_from]')).toBe(false);
    }
    await waitFor(() => expect(within(celluleDeTotal('Échoué')).getByText('1 paiement à reprendre')).toBeInTheDocument());
  });

  it('N1 — « Restant dû » de novembre compte l’échéance en retard de novembre, pas celle d’octobre', async () => {
    serveurBorneParEncaissement = true;
    lignes = [
      ligne({ id: 400, status: 'paid' }),
      ligne({ id: 401, status: 'late', paid_at: null, paid_amount: 0, amount: 250_000, remaining_amount: 250_000, period_start: '2026-11-01', due_date: '2026-11-05' }),
      ligne({ id: 402, status: 'late', paid_at: null, paid_amount: 0, amount: 300_000, remaining_amount: 300_000, period_start: '2026-10-01', due_date: '2026-10-05' }),
    ];
    rendre('tab=encaissements&period=2026-11');

    await waitFor(() => expect(lecturesDeLaBande(null).length).toBeGreaterThan(0));
    for (const u of lecturesDeLaBande(null)) {
      expect(u.searchParams.get('filter[date_from]')).toBe('2026-11-01');
      expect(u.searchParams.has('filter[paid_from]')).toBe(false);
    }
    await waitFor(() => expect(within(celluleDeTotal('Restant dû')).getByText(/^250\s?000/)).toBeInTheDocument());
    expect(within(celluleDeTotal('Restant dû')).queryByText(/550\s?000|300\s?000/)).not.toBeInTheDocument();
  });

  const reversementAApprouver = { id: 77, reference_number: 'PO-2026-0077', net_amount: 1_400_000, currency: 'XOF', status: 'awaiting_approval', period_start: '2026-10-01', issuer: { id: 3, name: 'Ibou Fall' } };
  const lecturesDeLaFile = () => appels.filter((u) => u.pathname === '/api/payouts' && u.searchParams.get('filter[status]') === 'awaiting_approval');

  it('A3 (bureau) — avec payouts.approve, la carte « À faire · reversements à approuver » lit la file', async () => {
    reponseSynthese = synthese({ payouts_awaiting_approval: { amount: 1_400_000, count: 1, landlords_count: 1 } });
    reversements = [reversementAApprouver];
    rendre();

    expect(await screen.findByText('À faire · reversements à approuver')).toBeInTheDocument();
    expect(lecturesDeLaFile().length).toBeGreaterThan(0);
  });

  it('A3 (bureau) — sans payouts.approve, ni lecture de la file ni carte', async () => {
    capacites.accordees.delete('payouts.approve');
    reponseSynthese = synthese({ payouts_awaiting_approval: { amount: 1_400_000, count: 1, landlords_count: 1 } });
    reversements = [reversementAApprouver];
    rendre();

    expect(await screen.findByText('Derniers encaissements')).toBeInTheDocument();
    await waitFor(() => expect(appels.some((u) => u.pathname.endsWith('/finance/summary'))).toBe(true));
    // La synthèse est reçue (elle annonce 1 reversement à approuver) : la file aurait été lue maintenant.
    expect(await screen.findByText(/14 baux · 4 de plus de 30 jours/)).toBeInTheDocument();
    expect(lecturesDeLaFile()).toEqual([]);
    expect(screen.queryByText('À faire · reversements à approuver')).not.toBeInTheDocument();
    expect(screen.queryByText('PO-2026-0077')).not.toBeInTheDocument();
  });

  it('la pastille d’un choix sans ligne reçue ne dit jamais « #42 » : son libellé, avec l’encre du choix', async () => {
    rendre('tab=encaissements&payer_id=42');

    expect(await screen.findByText('Aucun encaissement')).toBeInTheDocument();
    const pastille = screen.getByRole('button', { name: 'Payeur' });
    expect(pastille).toHaveAttribute('data-choisi', 'true');
    expect(screen.queryByText(/#42/)).not.toBeInTheDocument();
  });

  it('un bailleur choisi garde son nom même quand le registre filtré est vide', async () => {
    const user = userEvent.setup();
    bailleurs = [{ id: 5, user_id: 42, agency_id: 1, status: 'active', metadata: { first_name: 'Moussa', last_name: 'Sarr' }, user: { id: 42, first_name: 'Moussa', last_name: 'Sarr' } }];
    rendre('tab=encaissements');

    await user.click(await screen.findByRole('button', { name: 'Bailleur' }));
    await user.click(await screen.findByRole('button', { name: /Moussa Sarr/ }));

    await waitFor(() => expect(lecturesDeLaListe().some((u) => u.searchParams.get('filter[landlord_id]') === '42')).toBe(true));
    expect(await screen.findByRole('button', { name: 'Bailleur : Moussa Sarr' })).toBeInTheDocument();
    expect(screen.queryByText(/#42/)).not.toBeInTheDocument();
    // Le compte inclus ne se lit que pour son nom (sparse fieldset, CLAUDE.md).
    const lecture = appels.find((u) => u.pathname === '/api/owners');
    expect(lecture?.searchParams.get('fields[users]')).toBe('id,first_name,last_name,email,phone');
  });
  it('M1 (téléphone) — « Derniers encaissements » du point du mois se borne aussi par `paid_at`', async () => {
    ecran.telephone = true;
    rendre('period=2026-10');

    await waitFor(() => expect(appels.some((u) => u.pathname === '/api/payments/history' && u.searchParams.get('filter[status]') === 'paid' && u.searchParams.get('per_page') === '4')).toBe(true));
    for (const u of appels.filter((x) => x.pathname === '/api/payments/history' && x.searchParams.get('per_page') === '4')) {
      expect(u.searchParams.get('filter[paid_from]')).toBe('2026-10-01');
      expect(u.searchParams.get('filter[paid_to]')).toBe('2026-10-31');
      expect(u.searchParams.has('filter[date_from]')).toBe(false);
    }
  });

  it('un bailleur sans nom connu se choisit sous « #43 » dans la liste, mais la pastille ne le reprend pas', async () => {
    const user = userEvent.setup();
    bailleurs = [{ id: 6, user_id: 43, agency_id: 1, status: 'active', metadata: {}, user: { id: 43, first_name: null, last_name: null, email: null, phone: null } }];
    rendre('tab=encaissements');

    await user.click(await screen.findByRole('button', { name: 'Bailleur' }));
    await user.click(await screen.findByRole('button', { name: '#43' }));

    await waitFor(() => expect(lecturesDeLaListe().some((u) => u.searchParams.get('filter[landlord_id]') === '43')).toBe(true));
    const pastille = await screen.findByRole('button', { name: 'Bailleur' });
    expect(pastille).toHaveAttribute('data-choisi', 'true');
    expect(screen.queryByText('#43')).not.toBeInTheDocument();
  });
});

describe('D2 — les bornes de la lecture selon le statut filtré (m1 de la contre-vérification)', () => {
  const lire = (statut: string) => parametresDesEncaissements(new URLSearchParams(`period=2026-11&status=${statut}`), '2026-11');

  it.each(['late', 'pending', 'failed', 'partially_paid', 'cancelled'])('« %s » (non soldé) borne par l’échéance : date_from / date_to', (statut) => {
    const p = lire(statut);
    expect(p).toMatchObject({ status: statut, date_from: '2026-11-01', date_to: '2026-11-30' });
    expect(p.paid_from).toBeUndefined();
    expect(p.paid_to).toBeUndefined();
  });

  it.each(['paid', 'refunded'])('« %s » (encaissé) borne par l’encaissement : paid_from / paid_to', (statut) => {
    const p = lire(statut);
    expect(p).toMatchObject({ status: statut, paid_from: '2026-11-01', paid_to: '2026-11-30' });
    expect(p.date_from).toBeUndefined();
    expect(p.date_to).toBeUndefined();
  });

  it('sans statut, la lecture borne par l’encaissement', () => {
    const p = parametresDesEncaissements(new URLSearchParams('period=2026-11'), '2026-11');
    expect(p).toMatchObject({ paid_from: '2026-11-01', paid_to: '2026-11-30' });
    expect(p.date_from).toBeUndefined();
  });
});
