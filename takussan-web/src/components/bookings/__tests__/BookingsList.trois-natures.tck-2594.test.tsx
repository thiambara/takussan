/**
 * TCK-2594 (ADR-0102) — un écran, trois natures : le segmenté Séjours · Candidatures · Offres et
 * son nombre « à décider », les comptes d'UNE lecture `counts`, l'ouverture sur la bonne nature et
 * le bon statut, le client en tête de ligne, le montant dans les mots de la nature, et l'état vide
 * du personnel.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Booking } from '@/types/booking';
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

type Ligne = Record<'pending' | 'confirmed' | 'completed' | 'rejected' | 'cancelled' | 'expired', number>;
const ligne = (p: Partial<Ligne> = {}): Ligne => ({ pending: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0, ...p });
const etat = vi.hoisted(() => ({
  comptes: null as null | Record<'stay' | 'application' | 'offer', Record<string, number>>,
  reservations: [] as Partial<Booking>[],
  lus: [] as Array<{ kind?: string; status?: string; enabled?: boolean }>,
  appelsComptes: 0,
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBookings: (p: { kind?: string; status?: string; enabled?: boolean }) => {
    etat.lus.push(p);
    return { data: { data: etat.reservations, meta: { current_page: 1, last_page: 1, total: etat.reservations.length } }, isPending: false, isError: false, refetch: vi.fn() };
  },
  useBookingCounts: () => {
    etat.appelsComptes += 1;
    return { data: etat.comptes ? { data: etat.comptes } : undefined, isError: false };
  },
}));

const OFFRE_SARR: Partial<Booking> = {
  id: 7,
  kind: 'offer',
  status: 'pending',
  total_amount: 85_000_000,
  list_price_at_booking: 95_000_000,
  currency: 'XOF',
  created_at: '2026-11-11T16:40:00Z',
  customer_id: 3,
  customer: { id: 3, first_name: 'Ibrahima', last_name: 'Sarr', phone: '+221 76 540 27 91' },
  property: { id: 9, title: 'Villa', slug: 'villa', main_photo_url: null, price: 95_000_000, currency: 'XOF', contract_type: 'sale', location: { quarter: 'Almadies' } },
};

const natures = fr.bookings.liste.natures;
const telephone = () => document.querySelector<HTMLElement>('[data-slot="liste-du-telephone"]')!;
const bureau = () => document.querySelector<HTMLElement>('[data-slot="liste-du-bureau"]')!;
/** Les espaces de `Intl` (U+202F, U+00A0) lus comme des espaces. */
const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/[  ]/g, ' ');

describe('BookingsList — trois natures (TCK-2594)', () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.query = '';
    etat.lus.length = 0;
    etat.appelsComptes = 0;
    etat.reservations = [];
    etat.comptes = { stay: ligne({ pending: 3, confirmed: 1 }), application: ligne({ pending: 5, confirmed: 2 }), offer: ligne({ pending: 2 }) };
  });

  it('AC1 — le segmenté porte trois comptes « à décider », « À décider » est ouvert, chaque ligne nomme son client', () => {
    etat.reservations = [OFFRE_SARR];
    render(withIntl(<BookingsList titre="Réservations" />));

    const segmente = screen.getAllByRole('radiogroup', { name: natures.label })[0]!;
    const radios = within(segmente).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([`${natures.stay}3`, `${natures.application}5`, `${natures.offer}2`]);
    expect(screen.getAllByRole('button', { name: new RegExp(`^${fr.bookings.liste.statuts.pending}`) })[0]).toHaveAttribute('aria-pressed', 'true');
    expect(within(telephone()).getByRole('link', { name: 'Ibrahima Sarr' })).toHaveAttribute('href', '/app/bookings/7');
  });

  it('un compte nul ne se dit pas dans le segmenté (« Vide — personnel »)', () => {
    etat.comptes = { stay: ligne({ confirmed: 1 }), application: ligne(), offer: ligne({ pending: 1 }) };
    render(withIntl(<BookingsList titre="Réservations" />));
    const radios = within(screen.getAllByRole('radiogroup')[0]!).getAllByRole('radio');
    expect(radios.map((r) => r.textContent)).toEqual([natures.stay, natures.application, `${natures.offer}1`]);
  });

  it('les compteurs viennent d’une seule lecture `counts`, et la liste ne lit qu’un statut', () => {
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(etat.appelsComptes).toBe(1);
    expect(new Set(etat.lus.map((p) => p.status))).toEqual(new Set(['pending']));
    // Les pastilles : la nature ouverte (Séjours, la première à décider), statut par statut.
    expect(screen.getAllByRole('button', { name: new RegExp(`^${fr.bookings.liste.statuts.confirmed}\\s*1$`) })).not.toHaveLength(0);
  });

  it('la nature part en filter[kind] ; la choisir écrit `?kind=` et rend le statut à son ouverture', () => {
    nav.query = 'kind=offer&status=expired';
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(etat.lus.every((p) => p.kind === 'offer' && p.status === 'expired')).toBe(true);

    fireEvent.click(within(screen.getAllByRole('radiogroup')[0]!).getByRole('radio', { name: new RegExp(`^${natures.application}`) }));
    expect(nav.replace).toHaveBeenLastCalledWith('?kind=application', { scroll: false });
  });

  it('AC3 — sans demande à décider, la page s’ouvre sur « Confirmées »', () => {
    etat.comptes = { stay: ligne({ confirmed: 2, completed: 4 }), application: ligne(), offer: ligne() };
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(etat.lus.map((p) => p.status)).toEqual(['confirmed']);
    expect(screen.getAllByRole('button', { name: new RegExp(`^${fr.bookings.liste.statuts.confirmed}`) })[0]).toHaveAttribute('aria-pressed', 'true');
  });

  it('la liste attend les compteurs plutôt que de lire deux fois', () => {
    etat.comptes = null;
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(etat.lus).toHaveLength(0);
  });

  it('AC2 — la ligne de l’offre dit « Offre 85 000 000 F », le tableau son écart au prix affiché', () => {
    nav.query = 'kind=offer';
    etat.reservations = [OFFRE_SARR];
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(texte(telephone())).toContain('Offre 85 000 000 F');
    expect(texte(bureau())).toContain('Affiché 95 000 000 F · −10,5 %');
    expect(texte(bureau())).toContain('Villa · Almadies');
    // Le téléphone du client, au personnel (l'API le masque aux autres).
    expect(texte(bureau())).toContain('+221 76 540 27 91');
  });

  it('un séjour compte ses nuits, une candidature dit le loyer au mois', () => {
    etat.reservations = [
      { ...OFFRE_SARR, id: 1, kind: 'stay', total_amount: 165_000, start_date: '2026-11-12', end_date: '2026-11-15' },
      { ...OFFRE_SARR, id: 2, kind: 'application', total_amount: 250_000, start_date: '2026-12-01' },
    ];
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(texte(telephone())).toContain('3 nuits · 165 000 F');
    expect(texte(telephone())).toContain('Loyer 250 000 F/mois');
  });

  it('le vide du personnel : « Aucune demande à décider. », et le chemin vers les confirmées', () => {
    nav.query = 'kind=application&status=pending';
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(within(telephone()).getByRole('heading', { name: fr.bookings.liste.vide.titre })).toBeInTheDocument();
    expect(screen.queryByText(fr.bookings.client.vide.titre)).toBeNull();
    fireEvent.click(within(telephone()).getByRole('button', { name: fr.bookings.liste.vide.voirConfirmees }));
    expect(nav.replace).toHaveBeenLastCalledWith('?kind=application&status=confirmed', { scroll: false });
  });
});
