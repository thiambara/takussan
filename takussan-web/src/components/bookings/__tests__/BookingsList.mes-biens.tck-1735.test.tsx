/**
 * TCK-1735 (P167.05) — sous « Mes chiffres », « Demandes en attente » compte les réservations des
 * biens de l'agent : son lien porte `?only_mine=1`, que la liste lit, envoie à l'API (liste ET
 * compteurs) et montre allumée ; on l'éteint, et l'URL la perd.
 *
 * TCK-2594 — la case devient l'interrupteur « Mes biens seulement » de la maquette, montré au
 * personnel même éteint : la portée se choisit d'ici, plus seulement depuis « Mes chiffres ».
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
const personnel = vi.hoisted(() => ({ oui: true }));
// La saisie (TCK-2580) et les filtres du bureau ont leurs propres lectures : hors du sujet ici.
vi.mock('@/components/bookings/EntreeSaisieDemande', () => ({ EntreeSaisieDemande: () => null }));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => ({ data: undefined, isFetching: false }), useApiMutation: vi.fn() }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => personnel.oui, useAgenceDuPersonnelActif: () => (personnel.oui ? 1 : null) }));
type Filtres = { onlyMine?: boolean; search?: string | null; propertyId?: number | null; customerId?: number | null };
const lus = vi.hoisted(() => ({ liste: [] as Array<Filtres & { status: string }>, comptes: [] as Filtres[] }));
vi.mock('@/lib/queries/bookings', () => {
  const ligne = { pending: 1, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0 };
  return {
    useBookings: (params: Filtres & { status: string }) => {
      lus.liste.push(params);
      return { data: { data: [], meta: { current_page: 1, last_page: 1, total: 0 } }, isPending: false, isError: false, refetch: vi.fn() };
    },
    useBookingCounts: (filtres: Filtres) => {
      lus.comptes.push(filtres);
      return { data: { data: { stay: ligne, application: ligne, offer: ligne } }, isError: false };
    },
  };
});

const interrupteur = () => screen.getByRole('switch', { name: fr.bookings.liste.mesBiensSeulement });

describe('BookingsList — la portée « Mes biens » (TCK-1735, TCK-2594)', () => {
  beforeEach(() => {
    nav.replace.mockReset();
    lus.liste.length = 0;
    lus.comptes.length = 0;
    personnel.oui = true;
  });

  it('lit `?only_mine=1`, l’envoie à la liste et aux compteurs, et la montre allumée', () => {
    nav.query = 'only_mine=1';
    render(withIntl(<BookingsList titre="Réservations" />));

    expect(lus.liste.length).toBeGreaterThan(0);
    expect(lus.liste.every((p) => p.onlyMine === true)).toBe(true);
    expect(lus.comptes.every((p) => p.onlyMine === true)).toBe(true);
    expect(interrupteur()).toBeChecked();
  });

  it('s’éteint, et l’URL la perd en gardant le statut', () => {
    nav.query = 'status=confirmed&only_mine=1';
    render(withIntl(<BookingsList titre="Réservations" />));

    fireEvent.click(interrupteur());
    expect(nav.replace).toHaveBeenLastCalledWith('?status=confirmed', { scroll: false });
  });

  it('sans le paramètre, aucune portée ; l’interrupteur éteint s’allume', () => {
    nav.query = '';
    render(withIntl(<BookingsList titre="Réservations" />));

    expect(lus.liste.every((p) => !p.onlyMine)).toBe(true);
    expect(interrupteur()).not.toBeChecked();
    fireEvent.click(interrupteur());
    expect(nav.replace).toHaveBeenLastCalledWith('?only_mine=1', { scroll: false });
  });

  // TCK-2594 (r1 de la contre-vérification de cd1b2c83c) — les compteurs se lisent sous TOUS les
  // filtres de la liste, pas seulement « Mes biens » : une recherche, un bien ou un client qui
  // bornent la liste bornent aussi ses comptes, sans quoi « À décider 4 » mènerait à une liste vide.
  it('la recherche, le bien et le client bornent les compteurs comme la liste', () => {
    nav.query = 'q=Sarr&bien=12&client=7';
    render(withIntl(<BookingsList titre="Réservations" />));

    const attendus = { search: 'Sarr', propertyId: 12, customerId: 7 };
    expect(lus.comptes.length).toBeGreaterThan(0);
    expect(lus.liste.length).toBeGreaterThan(0);
    for (const p of [...lus.comptes, ...lus.liste]) expect(p).toMatchObject(attendus);
  });

  it('le bailleur n’a pas d’interrupteur : toutes ses réservations sont les siennes', () => {
    personnel.oui = false;
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
