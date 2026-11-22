/**
 * TCK-2005 (P171.03) — les listes de baux, de réservations et de visites se paginent : la 31ᵉ ligne
 * s'atteint par « Suivant ». (TCK-2644 — les accueils en attente sont devenus l'onglet « En attente du
 * locataire » de la liste des baux : la même pagination les porte.)
 *
 * Avant : chacune lisait une page de 30 (`per_page: 30`), sans page suivante ni « voir plus ».
 * Les lecteurs sont bouchonnés et paginent comme l'API : `page`, `per_page`, `meta.last_page`.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { LeasesList } from '../LeasesList';
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/app',
}));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton', user: { id: 1, roles: ['tenant'] } }) }));
vi.mock('@/lib/queries/leases-file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/leases-file')>()),
  useBauxDeLAgence: (_portion: unknown, _communs: unknown, page: number) => paginer(baux, { page, per_page: 30 }),
  useResumeDesBaux: () => ({ data: undefined }),
  useListesDEntree: () => ({ data: undefined }),
}));
// TCK-2594 — la liste des réservations monte la saisie (TCK-2580), les filtres du bureau et lit le
// profil actif : hors du sujet de la pagination.
vi.mock('@/components/bookings/EntreeSaisieDemande', () => ({ EntreeSaisieDemande: () => null }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true, useAgenceDuPersonnelActif: () => 1 }));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => ({ data: undefined, isFetching: false }), useApiMutation: vi.fn() }));
vi.mock('@/lib/queries/bookings', () => ({
  useBookings: (p: { page?: number; per_page?: number }) => paginer(reservations, p),
  // TCK-2594 — la liste ouvre sur la nature et le statut que ses compteurs désignent.
  useBookingCounts: () => ({
    data: { data: { stay: { pending: N, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0 }, application: { pending: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0 }, offer: { pending: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0 } } },
    isError: false,
  }),
}));
vi.mock('@/lib/queries/visits', () => ({
  useVisits: (p: { page?: number; per_page?: number }) => paginer(visites, p),
}));

function suivant(conteneur: HTMLElement = document.body) {
  fireEvent.click(within(conteneur).getByRole('button', { name: fr.console.pagination.next }));
}

describe('TCK-2005 — trois listes paginées', () => {
  beforeEach(() => {
    etat.lus.length = 0;
  });

  it('la liste des baux atteint le 31ᵉ', () => {
    render(withIntl(<LeasesList vue="agence" peutCreer={false} agencyId={1} />));
    // TCK-2644 — le tableau du bureau (la liste du téléphone porte la même page, masquée dès `lg`).
    const bureau = () => document.querySelector<HTMLElement>('[data-slot="liste-du-bureau"]')!;
    expect(within(bureau()).getByText('BAIL-30')).toBeInTheDocument();
    expect(within(bureau()).queryByText('BAIL-31')).toBeNull();
    suivant(bureau());
    expect(within(bureau()).getByText('BAIL-31')).toBeInTheDocument();
  });

  it('la liste des réservations atteint la 31ᵉ', () => {
    render(withIntl(<BookingsList titre="Réservations" />));
    // TCK-2594 — la liste du téléphone (le tableau du bureau porte la même page, masqué sous `lg`).
    const telephone = () => document.querySelector<HTMLElement>('[data-slot="liste-du-telephone"]')!;
    expect(within(telephone()).queryByText('Réservé 31')).toBeNull();
    suivant(telephone());
    expect(within(telephone()).getByText('Réservé 31')).toBeInTheDocument();
  });

  it('la liste des visites atteint la 31ᵉ', () => {
    render(withIntl(<VisitsList />));
    const panneau = screen.getByRole('tabpanel');
    expect(within(panneau).queryByText('Visité 31')).toBeNull();
    suivant(panneau);
    expect(within(screen.getByRole('tabpanel')).getByText('Visité 31')).toBeInTheDocument();
  });
});
