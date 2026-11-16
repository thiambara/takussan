import { describe, expect, it } from 'vitest';

import type { Booking } from '@/types/booking';
import { acomptesDus, appelDuClient, clientPeutAnnuler, formeDeLEcheance } from '../appel-du-client';

/**
 * TCK-2879 — ce qu'on attend du client sur une réservation : un seul geste, par priorité
 * (contre-offre > acompte > pièce manquante > solde), aucun quand rien n'est attendu.
 */
const sejour = (b: Partial<Booking> = {}): Booking =>
  ({ id: 1, property_id: 1, kind: 'stay', status: 'confirmed', total_amount: 110_000, deposit_amount: 33_000, amount_paid: 0, start_date: '2026-11-21', end_date: '2026-11-23', currency: 'XOF', created_at: '2026-11-01T10:00:00Z', ...b }) as Booking;
const candidature = (b: Partial<Booking> = {}): Booking =>
  ({ id: 2, property_id: 2, kind: 'application', status: 'pending', total_amount: 380_000, deposit_amount: null, amount_paid: 0, dossier: { received: 3, required: 4, missing: ['employment_certificate'] }, created_at: '2026-11-13T10:00:00Z', ...b }) as Booking;
const coEnCours = { id: 9, amount: 90_000_000, message: null, valid_until: '2026-11-18', status: 'pending' as const, created_at: '2026-11-14T10:00:00Z', responded_at: null };

describe('appelDuClient (TCK-2879)', () => {
  it('séjour sans rien de réglé : l’acompte, avant le jour d’arrivée', () => {
    expect(appelDuClient(sejour())).toEqual({ geste: 'acompte', montant: 33_000, avant: '2026-11-21' });
  });

  it('acompte réglé : le solde, « acompte payé »', () => {
    expect(appelDuClient(sejour({ total_amount: 210_000, deposit_amount: 63_000, amount_paid: 63_000 }))).toEqual({ geste: 'solde', montant: 147_000, acomptePaye: true });
  });

  it('séjour sans acompte : tout le dû est un solde ; tout réglé : aucun geste', () => {
    expect(appelDuClient(sejour({ deposit_amount: 0 }))).toEqual({ geste: 'solde', montant: 110_000, acomptePaye: false });
    expect(appelDuClient(sejour({ amount_paid: 110_000 }))).toEqual({ geste: null });
  });

  it('sans `amount_paid` servi, aucun geste de paiement', () => {
    expect(appelDuClient(sejour({ amount_paid: undefined }))).toEqual({ geste: null });
  });

  it('candidature 3/4 : la première pièce manquante ; 4/4 : aucun geste, « dossier complet »', () => {
    expect(appelDuClient(candidature())).toEqual({ geste: 'dossier', recues: 3, total: 4, manquante: 'employment_certificate' });
    expect(appelDuClient(candidature({ dossier: { received: 4, required: 4, missing: [] } }))).toEqual({ geste: null, dossierComplet: { recues: 4, total: 4 } });
  });

  it('une candidature ou une offre ne se paie pas sur la carte (leur montant est un loyer, un prix)', () => {
    expect(appelDuClient(candidature({ dossier: { received: 4, required: 4, missing: [] }, deposit_amount: 50_000 })).geste).toBeNull();
    expect(appelDuClient({ ...sejour(), kind: 'offer', dossier: null } as Booking).geste).toBeNull();
  });

  it('la contre-offre qui attend le client passe avant tout le reste', () => {
    const offre = { ...sejour(), kind: 'offer', status: 'pending', counter_offer: coEnCours, awaiting: 'customer' } as Booking;
    expect(appelDuClient(offre)).toEqual({ geste: 'contre_offre', contreOffre: coEnCours });
    // Déclinée, ou attendue de l'agence : plus rien à répondre.
    expect(appelDuClient({ ...offre, awaiting: 'agency' }).geste).not.toBe('contre_offre');
    expect(appelDuClient({ ...offre, counter_offer: { ...coEnCours, status: 'declined' } }).geste).not.toBe('contre_offre');
  });

  it('l’acompte passe avant la pièce manquante', () => {
    const b = { ...candidature(), kind: 'stay', status: 'confirmed', deposit_amount: 33_000, start_date: '2026-11-21' } as Booking;
    expect(appelDuClient(b).geste).toBe('acompte');
  });

  it('une réservation fermée n’attend rien', () => {
    expect(appelDuClient(sejour({ status: 'completed' }))).toEqual({ geste: null });
    expect(appelDuClient(candidature({ status: 'rejected' }))).toEqual({ geste: null });
  });
});

describe('clientPeutAnnuler (TCK-2879, règle de la fiche TCK-1301)', () => {
  const maintenant = new Date('2026-11-15T10:00:00Z');
  it('en attente ou confirmée, sauf un séjour confirmé commencé', () => {
    expect(clientPeutAnnuler(sejour(), maintenant)).toBe(true);
    expect(clientPeutAnnuler(candidature(), maintenant)).toBe(true);
    expect(clientPeutAnnuler(sejour({ start_date: '2026-11-15' }), maintenant)).toBe(false);
    expect(clientPeutAnnuler(sejour({ status: 'completed' }), maintenant)).toBe(false);
    expect(clientPeutAnnuler(sejour({ status: 'cancelled' }), maintenant)).toBe(false);
  });
});

describe('l’échéance de l’acompte (TCK-2879)', () => {
  const maintenant = new Date('2026-11-15T10:00:00Z');
  it('le nom du jour dans les six jours, la date au-delà, « dès maintenant » le jour même', () => {
    expect(formeDeLEcheance('2026-11-19', maintenant)).toBe('semaine');
    expect(formeDeLEcheance('2026-11-21', maintenant)).toBe('semaine');
    expect(formeDeLEcheance('2026-11-22', maintenant)).toBe('date');
    expect(formeDeLEcheance('2026-11-15', maintenant)).toBe('maintenant');
  });

  it('acomptesDus : leur nombre et la plus proche échéance', () => {
    expect(acomptesDus([sejour({ start_date: '2026-12-05' }), sejour({ start_date: '2026-11-19' }), candidature()])).toEqual({ n: 2, premier: '2026-11-19' });
    expect(acomptesDus([candidature()])).toEqual({ n: 0, premier: null });
  });
});
