/**
 * TCK-2005 (P171.03) — les listes de baux, de réservations, de visites et d'accueils de locataires
 * en attente se paginent : la 31ᵉ ligne s'atteint par « Suivant ».
 *
 * Avant : chacune lisait une page de 30 (`per_page: 30`), sans page suivante ni « voir plus ».
 * Les lecteurs sont bouchonnés et paginent comme l'API : `page`, `per_page`, `meta.last_page`.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { LeasesList } from '../LeasesList';
import { TenantOnboardingPendingList } from '../TenantOnboardingPendingList';
import { BookingsList } from '@/components/bookings/BookingsList';
import { VisitsList } from '@/components/visits/VisitsList';

const etat = vi.hoisted(() => ({ lus: [] as Array<{ page?: number; per_page?: number }> }));

function paginer<T>(lignes: T[], params: { page?: number; per_page?: number }) {
  etat.lus.push(params);
  const perPage = params.per_page ?? 20;
  const page = params.page ?? 1;
  return {
    data: {
      data: lignes.slice((page - 1) * perPage, page * perPage),
      meta: { current_page: page, last_page: Math.max(1, Math.ceil(lignes.length / perPage)), per_page: perPage, total: lignes.length },
    },
    isLoading: false,
    isError: false,
    isSuccess: true,
    isPending: false,
    status: 'success',
    error: null,
    refetch: vi.fn(),
  };
}

const N = 31;
const baux = Array.from({ length: N }, (_, i) => ({
  id: i + 1, reference_number: `BAIL-${i + 1}`, status: 'active', type: 'rental', start_date: '2026-01-01', end_date: null, monthly_rent: 100000,
}));
const reservations = Array.from({ length: N }, (_, i) => ({
  id: i + 1, status: 'pending', property: { title: `Réservé ${i + 1}` }, created_at: '2026-01-01T09:00:00Z', reference_number: null,
}));
const visites = Array.from({ length: N }, (_, i) => ({
  id: i + 1, status: 'scheduled', type: 'in_person', agent_id: 4, property: { title: `Visité ${i + 1}` }, scheduled_at: '2026-12-01T09:00:00Z',
}));
const accueils = Array.from({ length: N }, (_, i) => ({
  id: i + 1, lease_id: i + 1, created_at: '2026-01-01T09:00:00Z', lease: { reference_number: `ACC-${i + 1}`, signed_at: '2026-01-01' },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/app',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1, roles: ['tenant'] } }) }));
vi.mock('@/lib/queries/leases', () => ({
  useLeases: (p: { page?: number; per_page?: number }) => paginer(baux, p),
  useLeasePropertyOptions: () => ({ data: { data: [] } }),
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBookings: (p: { page?: number; per_page?: number }) => paginer(reservations, p),
}));
vi.mock('@/lib/queries/visits', () => ({
  useVisits: (p: { page?: number; per_page?: number }) => paginer(visites, p),
}));
vi.mock('@/lib/queries/tenant-onboarding', () => ({
  useAgencyOnboardingPending: (p: { page?: number; per_page?: number }) => paginer(accueils, p),
}));

function suivant(conteneur: HTMLElement = document.body) {
  fireEvent.click(within(conteneur).getByRole('button', { name: fr.console.pagination.next }));
}

describe('TCK-2005 — quatre listes paginées', () => {
  beforeEach(() => {
    etat.lus.length = 0;
  });

  it('la liste des baux atteint le 31ᵉ', () => {
    render(withIntl(<LeasesList />));
    expect(screen.getByText('BAIL-30')).toBeInTheDocument();
    expect(screen.queryByText('BAIL-31')).toBeNull();
    suivant();
    expect(screen.getByText('BAIL-31')).toBeInTheDocument();
  });

  it('la liste des réservations atteint la 31ᵉ', () => {
    render(withIntl(<BookingsList />));
    const panneau = screen.getByRole('tabpanel');
    expect(within(panneau).queryByText('Réservé 31')).toBeNull();
    suivant(panneau);
    expect(within(screen.getByRole('tabpanel')).getByText('Réservé 31')).toBeInTheDocument();
  });

  it('la liste des visites atteint la 31ᵉ', () => {
    render(withIntl(<VisitsList />));
    const panneau = screen.getByRole('tabpanel');
    expect(within(panneau).queryByText('Visité 31')).toBeNull();
    suivant(panneau);
    expect(within(screen.getByRole('tabpanel')).getByText('Visité 31')).toBeInTheDocument();
  });

  it('la liste des accueils en attente atteint le 31ᵉ', () => {
    render(withIntl(<TenantOnboardingPendingList agencyId={3} />));
    expect(screen.queryByText(/ACC-31\b/)).toBeNull();
    suivant();
    expect(screen.getByText(/ACC-31\b/)).toBeInTheDocument();
  });
});
