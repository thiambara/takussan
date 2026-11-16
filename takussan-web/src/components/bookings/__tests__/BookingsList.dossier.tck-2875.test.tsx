/**
 * TCK-2875 (maquette `app-reservations` a, e0) — la liste des candidatures : la colonne « Dossier »
 * au bureau (« 3/4 »), et « Expire demain » quand l'échéance d'une demande en attente tombe dans
 * moins de 48 h — au bureau en tête de « Reçue », au téléphone à la place de l'âge.
 */
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import fr from '@/messages/fr.json';
import type { Booking } from '@/types/booking';
import { BookingsList } from '../BookingsList';

const nav = vi.hoisted(() => ({ query: 'kind=application&status=pending' }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.query),
}));
vi.mock('@/components/bookings/EntreeSaisieDemande', () => ({ EntreeSaisieDemande: () => null }));
vi.mock('@/hooks/useApiQuery', () => ({ useApiQuery: () => ({ data: undefined, isFetching: false }), useApiMutation: vi.fn() }));
vi.mock('@/hooks/usePersonnelActif', () => ({ usePersonnelActif: () => true, useAgenceDuPersonnelActif: () => 1 }));
vi.mock('@/hooks/useMinuteCourante', () => ({ useMinuteCourante: () => new Date('2026-11-12T10:00:00Z') }));

const etat = vi.hoisted(() => ({ reservations: [] as Partial<Booking>[] }));
const ligne = { pending: 2, confirmed: 0, completed: 0, rejected: 0, cancelled: 0, expired: 0 };
vi.mock('@/lib/queries/bookings', () => ({
  useBookings: () => ({ data: { data: etat.reservations, meta: { current_page: 1, last_page: 1, total: etat.reservations.length } }, isPending: false, isError: false, refetch: vi.fn() }),
  useBookingCounts: () => ({ data: { data: { stay: { ...ligne, pending: 0 }, application: ligne, offer: { ...ligne, pending: 0 } } }, isError: false }),
}));

const MAINTENANT = new Date('2026-11-12T10:00:00Z');
const dans = (heures: number) => new Date(MAINTENANT.getTime() + heures * 3_600_000).toISOString();

const candidature = (id: number, prenom: string, p: Partial<Booking>): Partial<Booking> => ({
  id,
  kind: 'application',
  status: 'pending',
  total_amount: 300_000,
  currency: 'XOF',
  created_at: '2026-11-11T08:00:00Z',
  start_date: '2026-12-01',
  customer_id: id,
  customer: { id, first_name: prenom, last_name: 'Ba', phone: null },
  property: { id: 9, title: 'F3', slug: 'f3', main_photo_url: null, price: 300_000, currency: 'XOF', contract_type: 'rent', location: { quarter: 'Sacré-Cœur 3' } },
  ...p,
});

const bureau = () => document.querySelector<HTMLElement>('[data-slot="liste-du-bureau"]')!;
const telephone = () => document.querySelector<HTMLElement>('[data-slot="liste-du-telephone"]')!;
const texte = (el: Element) => (el.textContent ?? '').replace(/[  ]/g, ' ');

describe('BookingsList — dossier et échéance (TCK-2875)', () => {
  beforeEach(() => {
    nav.query = 'kind=application&status=pending';
    etat.reservations = [
      candidature(1, 'Ousmane', { dossier: { received: 3, required: 4, missing: ['guarantor_commitment'] }, response_deadline: dans(20), security_deposit_months: 2 }),
      candidature(2, 'Aliou', { dossier: { received: 1, required: 3, missing: ['payslips', 'employment_certificate'] }, response_deadline: dans(60) }),
    ];
  });

  it('AC4 — la colonne « Dossier » dit « 3/4 », et « Expire demain » à H−20 seulement', () => {
    render(withIntl(<BookingsList titre="Réservations" />));
    const entetes = Array.from(bureau().querySelectorAll('th')).map((th) => th.textContent);
    expect(entetes).toContain(fr.bookings.liste.colonnes.dossier);
    const [ousmane, aliou] = Array.from(bureau().querySelectorAll<HTMLElement>('[data-slot="rangee-de-reservation"]'));
    expect(texte(ousmane!)).toContain('3/4');
    expect(texte(ousmane!)).toContain('Entrée 1 déc. · caution 2 mois');
    expect(texte(ousmane!)).toContain(fr.bookings.liste.expireDemain);
    expect(texte(aliou!)).toContain('1/3');
    expect(texte(aliou!)).not.toContain(fr.bookings.liste.expireDemain);
  });

  it('au téléphone, « Expire demain » prend la place de l’âge', () => {
    render(withIntl(<BookingsList titre="Réservations" />));
    const lignes = Array.from(telephone().querySelectorAll('[data-slot="ligne-de-demande"]')).map(texte);
    expect(lignes[0]).toContain(fr.bookings.liste.expireDemain);
    expect(lignes[1]).not.toContain(fr.bookings.liste.expireDemain);
  });

  it('une confirmée dont l’échéance tombe dans 20 h ne porte pas l’alerte', () => {
    etat.reservations = [candidature(3, 'Khady', { status: 'confirmed', response_deadline: dans(20), expires_at: dans(20) })];
    render(withIntl(<BookingsList titre="Réservations" />));
    expect(texte(bureau())).not.toContain(fr.bookings.liste.expireDemain);
  });

  it('un séjour n’a pas de colonne « Dossier »', () => {
    nav.query = 'kind=stay&status=pending';
    etat.reservations = [{ ...candidature(4, 'Awa', {}), kind: 'stay', start_date: '2026-11-20', end_date: '2026-11-22' }];
    render(withIntl(<BookingsList titre="Réservations" />));
    const entetes = Array.from(bureau().querySelectorAll('th')).map((th) => th.textContent);
    expect(entetes).not.toContain(fr.bookings.liste.colonnes.dossier);
  });
});
