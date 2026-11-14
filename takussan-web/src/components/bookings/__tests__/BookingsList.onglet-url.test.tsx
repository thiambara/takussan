/**
 * TCK-1293 (P131.04) — le statut de la liste des réservations se lit et s'écrit dans `?status=`,
 * borné aux statuts : un lien vers `/app/bookings?status=confirmed` ouvre « Confirmées », et le
 * retour arrière depuis une réservation retrouve le statut quitté.
 *
 * TCK-2594 — les statuts sont des pastilles comptées (téléphone) et des onglets soulignés (bureau),
 * « Terminées » comprise ; sans `?status=`, la liste ouvre sur « À décider » s'il n'est pas vide.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import { BookingsList } from '../BookingsList';

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
// La saisie (TCK-2580) et les filtres du bureau ont leurs propres lectures : hors du sujet ici.
vi.mock('@/components/bookings/EntreeSaisieDemande', () => ({ EntreeSaisieDemande: () => null }));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => ({ data: undefined, isFetching: false }), useApiMutation: vi.fn() }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true, useAgenceDuPersonnelActif: () => 1 }));
const lus = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/queries/bookings', () => {
  const ligne = (pending: number) => ({ pending, confirmed: 2, completed: 7, rejected: 3, cancelled: 1, expired: 2 });
  return {
    useBookings: ({ status }: { status: string }) => {
      lus.push(status);
      return { data: { data: [], meta: { current_page: 1, last_page: 1, total: 0 } }, isPending: false, isError: false, refetch: vi.fn() };
    },
    useBookingCounts: () => ({ data: { data: { stay: ligne(3), application: ligne(5), offer: ligne(2) } }, isError: false }),
  };
});

const statuts = fr.bookings.liste.statuts;
const puce = (nom: string) => screen.getAllByRole('button', { name: new RegExp(`^${nom}`) })[0]!;

describe('BookingsList — statut porté par l’URL (TCK-1293, TCK-2594)', () => {
  beforeEach(() => {
    nav.replace.mockReset();
    lus.length = 0;
  });

  it('ouvre le statut que nomme `?status=`', () => {
    nav.query = 'status=confirmed';
    render(withIntl(<BookingsList titre="Réservations" />));

    expect(puce(statuts.confirmed)).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('tab', { name: new RegExp(`^${statuts.confirmed}`) })).toHaveAttribute('aria-selected', 'true');
    expect(lus).toContain('confirmed');
    expect(lus).not.toContain('pending');
  });

  it('« Terminées » est un statut de la liste ; une valeur inconnue retombe sur « À décider »', () => {
    nav.query = 'status=completed';
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(puce(statuts.completed)).toHaveAttribute('aria-pressed', 'true');
    expect(lus).toEqual(['completed']);
  });

  it('une valeur hors des statuts retombe sur « À décider »', () => {
    nav.query = 'status=tout';
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(puce(statuts.pending)).toHaveAttribute('aria-pressed', 'true');
  });

  it('écrit le statut choisi dans l’URL', () => {
    nav.query = 'kind=offer&status=confirmed';
    render(withIntl(<BookingsList titre="Réservations" />));

    fireEvent.click(puce(statuts.rejected));
    expect(nav.replace).toHaveBeenLastCalledWith('?kind=offer&status=rejected', { scroll: false });
  });
});
