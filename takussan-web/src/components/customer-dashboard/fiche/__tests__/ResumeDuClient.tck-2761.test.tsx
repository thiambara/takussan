/**
 * TCK-2761 — la fiche, la veille de la visite : l'adresse du bien et « Itinéraire » dans « Prochaine
 * action » (maquette `app-fil-commercial` a-3), et la phrase « déduit » dans CHERCHE. Chaque bloc ne
 * dit que ce que l'API a rendu : ni adresse servie, ni ligne ; ni coordonnées, ni geste.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { CustomerDetail, CustomerUpcomingVisit } from '@/types/customer';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/app/customers/7',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1 }, isLoading: false }) }));
vi.mock('@/lib/queries/visits', () => ({
  useConfirmVisit: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock('@/lib/queries/customer-gestures', () => ({ useEnregistrerContactClient: () => ({ mutate: vi.fn(), isError: false }) }));
vi.mock('@/lib/queries/pipeline', async (original) => ({
  ...(await original<typeof import('@/lib/queries/pipeline')>()),
  fetchCustomerTasks: async () => [],
}));
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchMatchingProperties: async () => ({ data: [], meta: { total: 3 } }),
}));

import { ProchaineActionDuClient, RechercheDuClient } from '../ResumeDuClient';

const DEMAIN = new Date(Date.now() + 86_400_000).toISOString();

function fiche(visite: Partial<CustomerUpcomingVisit> | null, extra: Partial<CustomerDetail> = {}): CustomerDetail {
  return {
    id: 7,
    first_name: 'Mouhamed',
    last_name: 'Dieng',
    phone: '+221778103538',
    visits_count: 1,
    next_action: visite ? { type: 'visit', id: 31, at: DEMAIN, label: 'Pièce indépendante' } : null,
    upcoming_visits: visite ? [{ id: 31, property_id: 4, status: 'confirmed', scheduled_at: DEMAIN, manage: true, ...visite }] : [],
    ...extra,
  } as unknown as CustomerDetail;
}

const ADRESSE = { line: 'Rue OU-48', neighborhood: 'Ouakam', city: 'Dakar', latitude: 14.7234567, longitude: -17.4876543 };

function rendre(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

describe('TCK-2761 — « Prochaine action », la veille', () => {
  beforeEach(() => vi.clearAllMocks());

  it('AC1 — une visite confirmée montre l’adresse et « Itinéraire » vers les coordonnées', () => {
    rendre(<ProchaineActionDuClient customer={fiche({ address: ADRESSE })} />);

    expect(screen.getByText('Rue OU-48 · confirmée')).toBeInTheDocument();
    const lien = screen.getByRole('link', { name: 'Itinéraire vers Rue OU-48' });
    expect(lien).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=14.7234567,-17.4876543');
    expect(lien).toHaveAttribute('target', '_blank');
    expect(screen.getByRole('link', { name: /Rappeler la visite/ })).toBeInTheDocument();
  });

  it('AC1 — sans coordonnées, l’adresse reste et il n’y a pas de geste (jamais vers l’adresse écrite)', () => {
    rendre(<ProchaineActionDuClient customer={fiche({ address: { ...ADRESSE, latitude: null, longitude: null } })} />);

    expect(screen.getByText('Rue OU-48 · confirmée')).toBeInTheDocument();
    expect(screen.queryByText('Itinéraire')).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="itineraire-de-la-visite"]')).toBeNull();
  });

  it('sans rue, le quartier fait l’adresse', () => {
    rendre(<ProchaineActionDuClient customer={fiche({ address: { ...ADRESSE, line: null } })} />);
    expect(screen.getByText('Ouakam · confirmée')).toBeInTheDocument();
  });

  it('une visite à confirmer le dit après l’adresse', () => {
    rendre(<ProchaineActionDuClient customer={fiche({ status: 'scheduled', address: ADRESSE })} />);
    expect(screen.getByText('Rue OU-48 · à confirmer')).toBeInTheDocument();
  });

  it('AC4 — sans adresse servie (lecteur hors du bien), ni ligne d’adresse ni « Itinéraire »', () => {
    rendre(<ProchaineActionDuClient customer={fiche({})} />);

    expect(screen.getByText('Confirmée')).toBeInTheDocument();
    expect(document.querySelector('[data-slot="adresse-de-la-visite"]')).toBeNull();
    expect(screen.queryByText('Itinéraire')).not.toBeInTheDocument();
  });

  it('AC2 — « SMS envoyé » ne se dit jamais : l’envoi n’est pas tracé', () => {
    rendre(<ProchaineActionDuClient customer={fiche({ address: ADRESSE })} />);
    expect(screen.queryByText(/SMS/)).not.toBeInTheDocument();
  });
});

describe('TCK-2761 — CHERCHE, la recherche déduite d’une demande', () => {
  const recherche: Partial<CustomerDetail> = { seeking_contract_type: 'rent', seeking_property_types: ['room'], seeking_neighborhoods: ['Ouakam'], budget_max: '102000.00' };

  it('AC3 — déduite, elle se dit telle', () => {
    rendre(<RechercheDuClient customer={fiche(null, { ...recherche, seeking_deduced_at: '2026-11-14T09:00:00+00:00' })} />);
    expect(screen.getByText('Déduit du bien de sa demande, à confirmer avec lui.')).toBeInTheDocument();
  });

  it('AC3 — modifiée (marqueur effacé par l’API), elle ne l’est plus', () => {
    rendre(<RechercheDuClient customer={fiche(null, { ...recherche, seeking_deduced_at: null })} />);
    expect(screen.queryByText(/Déduit du bien/)).not.toBeInTheDocument();
  });
});
