/**
 * TCK-2805 — sur `/app/payments`, la densité choisie (`?per_page=`) part à l'API, et une page
 * au-delà de la dernière ne passe plus pour une liste vide.
 *
 * Sur le double RÉSEAU : les vrais hooks (`useInvoices`, `usePayouts`, `usePaymentsHistory`,
 * `useServiceProviderBills`), un vrai `QueryClient`, et un `fetch` simulé qui lit la requête partie
 * — c'est elle qu'on vérifie (AC1, AC2), pas les paramètres passés au hook. Il répond comme l'API :
 * `meta.per_page` et `meta.current_page` sont ceux demandés, `meta.last_page` vient du total.
 *
 * L'adresse est celle de `@/test/navigation-url` : `router.replace` la change vraiment et refait le
 * rendu, comme un utilisateur qui choisit une densité (AC3). `PropertyPagination` n'est PAS doublé.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { navigationDeTest } from '@/test/navigation-url';
import { createQueryClient } from '@/lib/query-client';
import fr from '@/messages/fr.json';

import { InvoicesTable } from '../InvoicesTable';
import { PaymentsHistoryTable } from '../PaymentsHistoryTable';
import { PayoutsTable } from '../PayoutsTable';
import { ServiceProviderBillsTable } from '../ServiceProviderBillsTable';

vi.mock('next/navigation', async () => (await import('@/test/navigation-url')).moduleNavigation);
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ token: 'jeton', user: { id: 77, agency_id: 1, roles: ['agency_admin'] } }),
}));

const t = fr.payments.pageAuDela;

type Ligne = Record<string, unknown>;

interface Registre {
  readonly nom: string;
  readonly chemin: string;
  readonly ui: () => ReactElement;
  readonly ligne: (id: number) => Ligne;
  readonly videTitre: string;
  readonly metaEnPlus?: (total: number) => Record<string, unknown>;
}

const REGISTRES: readonly Registre[] = [
  {
    nom: 'Factures (InvoicesTable)',
    chemin: '/api/invoices',
    ui: () => <InvoicesTable onSelect={() => undefined} />,
    ligne: (id) => ({
      id,
      reference_number: `INV-${id}`,
      customer_id: 1,
      issued_by_id: 2,
      agency_id: 1,
      status: 'sent',
      issue_date: '2026-07-01',
      due_date: '2026-07-31',
      subtotal: 1000,
      tax_rate: null,
      tax_amount: null,
      total_amount: 1000,
      currency: 'XOF',
      created_at: '2026-07-01T00:00:00Z',
    }),
    videTitre: fr.payments.invoices.empty_title,
  },
  {
    nom: 'Reversements (PayoutsTable)',
    chemin: '/api/payouts',
    ui: () => <PayoutsTable onSelect={() => undefined} />,
    ligne: (id) => ({
      id,
      reference_number: `PAY-${id}`,
      landlord_id: 8,
      status: 'completed',
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      gross_amount: 1000,
      net_amount: 900,
      currency: 'XOF',
    }),
    videTitre: fr.payments.payouts.empty_title,
  },
  {
    nom: 'Paiements (PaymentsHistoryTable)',
    chemin: '/api/payments/history',
    ui: () => <PaymentsHistoryTable />,
    ligne: (id) => ({
      source: 'lease',
      id,
      reference_number: `LP-${id}`,
      amount: 1000,
      currency: 'XOF',
      payment_method: 'wave',
      payment_type: 'rent',
      status: 'paid',
      paid_amount: 1000,
      remaining_amount: 0,
      date: '2026-11-03',
      lease_id: 63,
      booking_id: null,
    }),
    videTitre: fr.payments.history.empty_title,
    metaEnPlus: (total) => ({
      totals: { count: total, amount: total * 1000, paid_amount: total * 1000, remaining_amount: 0 },
      truncated: false,
      limit: 5000,
    }),
  },
  {
    nom: 'Interventions, agence (ServiceProviderBillsTable)',
    chemin: '/api/service-provider-bills',
    ui: () => <ServiceProviderBillsTable mode="agency" />,
    ligne: (id) => ({
      id,
      maintenance_request_id: id,
      agency_id: 1,
      property_id: 1,
      provider_id: 77,
      reference_number: `SPB-${id}`,
      provider_reference: null,
      amount: 1000,
      currency: 'XOF',
      exceeds_quote: false,
      status: 'paid',
      validated_at: null,
      rejection_reason: null,
      rechargeable_to_landlord: false,
      imputed_payout_id: null,
      created_at: '2026-10-01T10:00:00Z',
    }),
    videTitre: fr.payments.serviceProviderBills.emptyTitle,
  },
];

/** Le double réseau : chaque requête partie, et une réponse calquée sur l'API pour `total` lignes. */
const RESEAU = { total: 25, requetes: [] as URL[] };

function doublerLeReseau(registre: Registre) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entree: RequestInfo | URL) => {
      const url = new URL(String(entree), 'http://api.test');
      RESEAU.requetes.push(url);
      const parPage = Math.min(Math.max(Number(url.searchParams.get('per_page') ?? 20) || 20, 1), 100);
      const page = Math.max(Number(url.searchParams.get('page') ?? 1) || 1, 1);
      const total = RESEAU.total;
      const debut = (page - 1) * parPage;
      const data = Array.from({ length: Math.max(0, Math.min(parPage, total - debut)) }, (_, i) =>
        registre.ligne(debut + i + 1),
      );
      const meta = {
        total,
        per_page: parPage,
        current_page: page,
        last_page: Math.max(1, Math.ceil(total / parPage)),
        ...(registre.metaEnPlus?.(total) ?? {}),
      };
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ data, meta }),
      } as unknown as Response;
    }),
  );
}

const derniereRequete = (chemin: string) => {
  const parties = RESEAU.requetes.filter((u) => u.pathname.endsWith(chemin));
  return parties.at(-1);
};

function rendre(registre: Registre) {
  const client = createQueryClient();
  return render(withIntl(<QueryClientProvider client={client}>{registre.ui()}</QueryClientProvider>));
}

beforeEach(() => {
  RESEAU.total = 25;
  RESEAU.requetes.length = 0;
});
afterEach(() => vi.unstubAllGlobals());

describe.each(REGISTRES)('TCK-2805 — $nom', (registre) => {
  beforeEach(() => doublerLeReseau(registre));

  it('AC1 — ?per_page=50 dans l’adresse : la requête partie porte per_page=50', async () => {
    navigationDeTest.reinitialiser('per_page=50');
    rendre(registre);
    await waitFor(() => expect(derniereRequete(registre.chemin)).toBeDefined());
    expect(derniereRequete(registre.chemin)!.searchParams.get('per_page')).toBe('50');
    expect(derniereRequete(registre.chemin)!.searchParams.get('page')).toBe('1');
  });

  it.each(['37', 'abc', '5000', '-10'])('AC2 — ?per_page=%s : la requête partie porte per_page=20', async (valeur) => {
    navigationDeTest.reinitialiser(`per_page=${valeur}&page=-3`);
    rendre(registre);
    await waitFor(() => expect(derniereRequete(registre.chemin)).toBeDefined());
    expect(derniereRequete(registre.chemin)!.searchParams.get('per_page')).toBe('20');
    expect(derniereRequete(registre.chemin)!.searchParams.get('page')).toBe('1');
  });

  it('AC3 — choisir 50 : l’adresse porte per_page=50, la page revient à 1, la requête suivante porte 50, le sélecteur dit 50', async () => {
    const user = userEvent.setup();
    navigationDeTest.reinitialiser('tab=x&page=2');
    rendre(registre);
    const selecteur = await screen.findByRole('combobox', { name: fr.search.toolbar.perPageAria });
    expect(selecteur).toHaveTextContent('20 / page');
    expect(derniereRequete(registre.chemin)!.searchParams.get('page')).toBe('2');

    await user.click(selecteur);
    await user.click(await screen.findByRole('option', { name: '50 / page' }));

    const adresse = new URLSearchParams(navigationDeTest.requete());
    expect(adresse.get('per_page')).toBe('50');
    expect(adresse.get('page')).toBeNull();
    expect(adresse.get('tab')).toBe('x');
    await waitFor(() => expect(derniereRequete(registre.chemin)!.searchParams.get('per_page')).toBe('50'));
    expect(derniereRequete(registre.chemin)!.searchParams.get('page')).toBe('1');
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: fr.search.toolbar.perPageAria })).toHaveTextContent('50 / page'),
    );
  });

  it('AC4 — ?page=9 sur 25 lignes (2 pages) : « au-delà de la dernière page », un chemin vers la page 2, et pas l’état vide', async () => {
    const user = userEvent.setup();
    navigationDeTest.reinitialiser('tab=x&per_page=20&page=9');
    rendre(registre);

    expect(await screen.findByText(t.title)).toBeInTheDocument();
    expect(screen.queryByText(registre.videTitre)).toBeNull();
    expect(derniereRequete(registre.chemin)!.searchParams.get('page')).toBe('9');

    await user.click(screen.getByRole('button', { name: 'Aller à la page 2' }));
    const adresse = new URLSearchParams(navigationDeTest.requete());
    expect(adresse.get('page')).toBe('2');
    expect(adresse.get('tab')).toBe('x');
    expect(adresse.get('per_page')).toBe('20');
    await waitFor(() => expect(derniereRequete(registre.chemin)!.searchParams.get('page')).toBe('2'));
    await waitFor(() => expect(screen.queryByText(t.title)).toBeNull());
  });

  it('AC4 — « Revenir à la première page » retire ?page= et garde le reste', async () => {
    const user = userEvent.setup();
    navigationDeTest.reinitialiser('tab=x&page=9');
    rendre(registre);
    await user.click(await screen.findByRole('button', { name: t.premiere }));
    const adresse = new URLSearchParams(navigationDeTest.requete());
    expect(adresse.get('page')).toBeNull();
    expect(adresse.get('tab')).toBe('x');
  });

  it('AC5 — une liste réellement vide (total 0) : l’état vide d’aujourd’hui, sans « au-delà »', async () => {
    RESEAU.total = 0;
    navigationDeTest.reinitialiser('');
    rendre(registre);
    expect(await screen.findByText(registre.videTitre)).toBeInTheDocument();
    expect(screen.queryByText(t.title)).toBeNull();
  });
});

describe('TCK-2805 — Interventions, le prestataire : la page au-delà se lit sur ?factures_page=', () => {
  beforeEach(() => doublerLeReseau(REGISTRES[3]));

  it('?factures_page=9 : l’état « au-delà », et « Aller à la page 2 » écrit ?factures_page=2 sans toucher ?page=', async () => {
    const user = userEvent.setup();
    navigationDeTest.reinitialiser('page=4&factures_page=9');
    const client = createQueryClient();
    render(withIntl(<QueryClientProvider client={client}><ServiceProviderBillsTable mode="provider" /></QueryClientProvider>));

    const etat = (await screen.findByText(t.title)).closest('[data-etat="page-au-dela"]') as HTMLElement;
    expect(screen.queryByText(fr.payments.serviceProviderBills.emptyTitle)).toBeNull();
    await user.click(within(etat).getByRole('button', { name: 'Aller à la page 2' }));
    const adresse = new URLSearchParams(navigationDeTest.requete());
    expect(adresse.get('factures_page')).toBe('2');
    expect(adresse.get('page')).toBe('4');
  });
});
