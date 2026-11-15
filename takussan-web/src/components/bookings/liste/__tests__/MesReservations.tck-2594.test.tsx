/**
 * TCK-2594 — « Mes réservations », la vue du client : trois groupes comptés (En cours, Terminées,
 * Annulées), chacun un `filter[status]` à plusieurs statuts ; sans aucune réservation, le vide du
 * CLIENT et son bouton (AC5) — jamais celui du personnel.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Booking } from '@/types/booking';
import { MesReservations } from '../MesReservations';

const nav = vi.hoisted(() => ({ query: '', replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
  usePathname: () => '/app/bookings',
}));
const zero = { pending: 0, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0 };
const etat = vi.hoisted(() => ({
  comptes: null as null | Record<string, Record<string, number>>,
  reservations: [] as Partial<Booking>[],
  lus: [] as Array<{ status?: string; kind?: string }>,
}));
vi.mock('@/lib/queries/bookings', () => ({
  useBookings: (p: { status?: string; kind?: string }) => {
    etat.lus.push(p);
    return { data: { data: etat.reservations, meta: { current_page: 1, last_page: 1, total: etat.reservations.length } }, isPending: false, isError: false, refetch: vi.fn() };
  },
  useBookingCounts: () => ({ data: etat.comptes ? { data: etat.comptes } : undefined, isError: false }),
}));

const texte = (el: HTMLElement) => (el.textContent ?? '').replace(/[  ]/g, ' ');

describe('MesReservations (TCK-2594)', () => {
  beforeEach(() => {
    nav.replace.mockReset();
    nav.query = '';
    etat.lus.length = 0;
    etat.reservations = [];
    etat.comptes = { stay: { ...zero }, application: { ...zero }, offer: { ...zero } };
  });

  it('AC5 — sans réservation : « Vous n’avez pas encore réservé. » et « Parcourir les biens » vers la liste publique', () => {
    render(withIntl(<MesReservations />));
    expect(screen.getByRole('heading', { name: fr.bookings.client.vide.titre })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: fr.bookings.client.vide.action })).toHaveAttribute('href', '/fr/properties');
    expect(screen.queryByText(fr.bookings.liste.vide.titre)).toBeNull();
  });

  it('les groupes se comptent et lisent plusieurs statuts à la fois', () => {
    etat.comptes = { stay: { ...zero, pending: 1, confirmed: 2, completed: 1 }, application: { ...zero, pending: 1, rejected: 2 }, offer: { ...zero, expired: 1 } };
    render(withIntl(<MesReservations />));
    expect(screen.getAllByRole('button', { name: new RegExp(`^${fr.bookings.client.groupes.en_cours}\\s*4$`) })[0]).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByRole('button', { name: new RegExp(`^${fr.bookings.client.groupes.annulees}\\s*3$`) })).not.toHaveLength(0);
    expect(etat.lus.map((p) => p.status)).toEqual(['pending,confirmed']);

    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${fr.bookings.client.groupes.annulees}`) })[0]!);
    expect(nav.replace).toHaveBeenLastCalledWith('?groupe=annulees', { scroll: false });
  });

  it('une carte dit la nature, le statut, le bien, les nuits et le total ; une terminée invite à l’avis', () => {
    etat.comptes = { stay: { ...zero, completed: 1 }, application: { ...zero }, offer: { ...zero } };
    nav.query = 'groupe=terminees';
    etat.reservations = [
      {
        id: 4,
        kind: 'stay',
        status: 'completed',
        total_amount: 70_000,
        currency: 'XOF',
        start_date: '2026-10-02',
        end_date: '2026-10-04',
        created_at: '2026-09-20T10:00:00Z',
        property: { id: 1, title: 'Studio meublé', slug: 's', main_photo_url: null, price: 35_000, currency: 'XOF', contract_type: 'rent', location: { quarter: 'Mermoz' } },
      },
    ];
    render(withIntl(<MesReservations />));
    expect(etat.lus.map((p) => p.status)).toEqual(['completed']);
    const carte = screen.getByRole('listitem');
    expect(texte(carte)).toContain(fr.bookings.client.nature.stay);
    expect(texte(carte)).toContain(fr.bookings.status.completed);
    expect(texte(carte)).toContain('Studio meublé · Mermoz');
    expect(texte(carte)).toMatch(/2 nuits/);
    expect(texte(carte)).toContain('70 000 F');
    expect(screen.getByRole('link', { name: fr.bookings.client.actions.avis })).toHaveAttribute('href', '/app/bookings/4');
  });
});
