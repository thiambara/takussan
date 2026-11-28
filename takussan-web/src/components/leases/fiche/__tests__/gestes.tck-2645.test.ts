/**
 * TCK-2645 — le geste principal et les gestes de « ⋯ » d'un bail : un par état et par lecteur, tout
 * par `abilities` (jamais par `user.roles`), rien avant les capacités.
 *
 * TCK-3011 (ADR-0139, AC1) — `abilities` porte la policy ET l'état : les fonctions ne comparent plus le
 * statut pour décider. Les cas « le statut dit oui, l'API dit non » sont épinglés : rien n'est offert.
 */
import { describe, expect, it } from 'vitest';

import type { LeaseWithRelations } from '@/lib/queries/leases';
import type { LeaseAbilities, LeasePayment } from '@/types/lease';
import { echeancierExiste, gestePrincipal, gestesSecondaires } from '../gestes';

const GESTION: LeaseAbilities = {
  renew: true,
  review_rent: true,
  record_payment: true,
  refund_deposit: false,
  request_early_termination: true,
  cancel_early_termination: false,
  add_payment: true,
  generate_schedule: false,
  request_signature: false,
  sign: false,
  update: true,
  add_document: true,
  download_contract: true,
  leave_review: false,
  give_notice: false,
};
const LOCATAIRE: LeaseAbilities = {
  renew: false,
  review_rent: false,
  record_payment: false,
  refund_deposit: false,
  request_early_termination: true,
  update: false,
  add_document: true,
  download_contract: true,
  leave_review: true,
  give_notice: true,
};

function bail(partiel: Partial<LeaseWithRelations> = {}): LeaseWithRelations {
  return {
    id: 4,
    status: 'active',
    type: 'residential_rent',
    deposit_amount: 640000,
    tenant: { id: 1, user_id: 114, first_name: 'Fatou', last_name: 'Wade', phone: '+221770000001' },
    abilities: GESTION,
    ...partiel,
  } as LeaseWithRelations;
}

function echeance(partiel: Partial<LeasePayment>): LeasePayment {
  return {
    id: 1,
    payment_type: 'rent',
    status: 'pending',
    due_date: '2026-11-05',
    period_start: '2026-11-01',
    amount: 640000,
    amount_due: 0,
    receipt_available: false,
    is_overdue: false,
    abilities: { pay: false, remind: false, record_payment: !['paid', 'cancelled'].includes(partiel.status ?? 'pending') },
    ...partiel,
  } as LeasePayment;
}

const ctx = (paiements?: LeasePayment[], paiementEnLigne = true) => ({ paiements, paiementEnLigne });

describe('gestePrincipal — un geste par état et par lecteur (TCK-2645)', () => {
  it('rien tant que les capacités ne sont pas chargées — quel que soit l’état du bail', () => {
    expect(gestePrincipal(bail({ abilities: undefined }), ctx([]))).toBeNull();
    const signable = { abilities: undefined, can_request_signature: true, can_sign_as: ['tenant' as const] };
    expect(gestePrincipal(bail({ ...signable, status: 'draft' }), ctx([]))).toBeNull();
    expect(gestePrincipal(bail({ ...signable, status: 'pending_signature' }), ctx([]))).toBeNull();
    expect(gestesSecondaires(bail({ abilities: undefined }))).toEqual([]);
  });

  it('gestion, bail actif : « Encaisser », l’échéance en retard présélectionnée', () => {
    const p = [echeance({ id: 9, status: 'paid' }), echeance({ id: 29, status: 'late', is_overdue: true, due_date: '2026-11-05' })];
    expect(gestePrincipal(bail(), ctx(p))).toEqual({ type: 'encaisser', paiement: 29 });
  });

  it('sans échéance encaissable ni `add_payment`, la gestion n’a pas de geste principal', () => {
    expect(gestePrincipal(bail({ abilities: { ...GESTION, add_payment: false } }), ctx([]))).toBeNull();
    // Une échéance due que l'API ne laisse pas encaisser (sa ligne le dit) ne s'offre pas.
    const verrouillee = echeance({ id: 29, status: 'late', abilities: { pay: false, remind: false, record_payment: false } });
    expect(gestePrincipal(bail({ abilities: { ...GESTION, add_payment: false } }), ctx([verrouillee]))).toBeNull();
  });

  it('AC1 — le statut ne décide plus : un bail « actif » sans `add_payment` ni ligne encaissable n’offre rien', () => {
    // Avant : `record_payment && status ∈ {active, terminating, expired}` offrait « Encaisser ».
    expect(gestePrincipal(bail({ status: 'active', abilities: { ...GESTION, add_payment: false } }), ctx([]))).toBeNull();
    // Et un brouillon sans `request_signature` n'offre pas l'envoi, même si `can_request_signature` le dit.
    expect(gestePrincipal(bail({ status: 'draft', can_request_signature: true, abilities: { ...GESTION, add_payment: false } }), ctx([]))).toBeNull();
  });

  it('brouillon : « Envoyer à la signature », bloqué avec sa raison pour un locataire sans compte', () => {
    const envoi = { ...GESTION, request_signature: true, add_payment: false };
    expect(gestePrincipal(bail({ status: 'draft', abilities: envoi }), ctx([]))).toEqual({ type: 'envoyer-signature', bloque: null });
    const sansCompte = bail({ status: 'draft', abilities: envoi, tenant: { id: 1, user_id: null } });
    expect(gestePrincipal(sansCompte, ctx([]))).toEqual({ type: 'envoyer-signature', bloque: 'sans-compte' });
  });

  it('en signature : le lecteur qui peut signer « Signe » ; la gestion relance par WhatsApp la partie qui n’a pas signé', () => {
    const enSignature = { status: 'pending_signature' as const };
    expect(gestePrincipal(bail({ ...enSignature, abilities: { ...GESTION, sign: true, request_signature: true } }), ctx([]))).toEqual({ type: 'signer' });
    const relance = gestePrincipal(
      bail({ ...enSignature, abilities: { ...GESTION, request_signature: true }, signatures: [{ role: 'landlord', current: true } as never] }),
      ctx([]),
    );
    expect(relance).toEqual({ type: 'relancer-signature', role: 'tenant', telephone: '+221770000001', prenom: 'Fatou' });
  });

  it('en signature, sans numéro servi pour la partie qui n’a pas signé : aucun geste (aucun numéro neuf)', () => {
    const b = bail({
      status: 'pending_signature',
      abilities: { ...GESTION, request_signature: true },
      tenant: { id: 1, user_id: 3, first_name: 'Fatou', phone: null },
    });
    expect(gestePrincipal(b, ctx([]))).toBeNull();
  });

  it('locataire avec une échéance due et le paiement en ligne : « Payer »', () => {
    const due = echeance({ id: 29, amount_due: 672000, is_overdue: true });
    expect(gestePrincipal(bail({ abilities: LOCATAIRE }), ctx([due]))).toEqual({ type: 'payer', paiement: due });
  });

  it('locataire sans paiement en ligne : le contrat (décision 14)', () => {
    const due = echeance({ id: 29, amount_due: 672000 });
    expect(gestePrincipal(bail({ abilities: LOCATAIRE }), ctx([due], false))).toEqual({ type: 'contrat' });
  });

  it('locataire à jour : « Télécharger ma quittance », la plus récente', () => {
    const p = [echeance({ id: 1, status: 'paid', receipt_available: true, due_date: '2026-10-05' }), echeance({ id: 2, status: 'paid', receipt_available: true, due_date: '2026-11-05' })];
    expect(gestePrincipal(bail({ abilities: LOCATAIRE }), ctx(p))).toMatchObject({ type: 'quittance', paiement: { id: 2 } });
  });

  it('locataire : rien tant que les échéances chargent', () => {
    expect(gestePrincipal(bail({ abilities: LOCATAIRE }), ctx(undefined))).toBeNull();
  });
});

describe('gestesSecondaires — « ⋯ » et la carte Actions (TCK-2645, TCK-3011)', () => {
  it('« Générer l’échéancier » suit `generate_schedule` : l’API dit s’il existe déjà', () => {
    expect(gestesSecondaires(bail({ abilities: { ...GESTION, generate_schedule: true } }))).toContain('generer');
    expect(gestesSecondaires(bail())).not.toContain('generer');
  });

  it('AC1 — le statut ne décide plus : chaque geste sur sa clé, quel que soit le statut servi', () => {
    // Un bail « actif » dont l'API refuse la révision (une vente, un loyer nul) : rien.
    expect(gestesSecondaires(bail({ type: 'sale', abilities: { ...GESTION, review_rent: false } }))).not.toContain('reviser');
    // Une caution restituable : la clé suffit, la fonction ne recompte ni le statut ni le reste dû.
    expect(gestesSecondaires(bail({ status: 'terminated', abilities: { ...GESTION, refund_deposit: true } }))).toContain('restituer');
    expect(gestesSecondaires(bail({ status: 'terminated' }))).not.toContain('restituer');
  });

  it('l’ordre du ticket, la résiliation en dernier', () => {
    expect(gestesSecondaires(bail())).toEqual(['reviser', 'renouveler', 'document', 'resilier']);
    const tout = { ...GESTION, refund_deposit: true, generate_schedule: true, abandon: true };
    expect(gestesSecondaires(bail({ abilities: tout }))).toEqual(['reviser', 'renouveler', 'document', 'restituer', 'generer', 'resilier', 'abandonner']);
  });

  it('le locataire a son préavis (et son dépôt de document), jamais la résiliation de la gestion', () => {
    expect(gestesSecondaires(bail({ abilities: LOCATAIRE }))).toEqual(['document', 'preavis']);
  });

  it('echeancierExiste : la caution seule ne compte pas', () => {
    expect(echeancierExiste([echeance({ payment_type: 'deposit' })])).toBe(false);
    expect(echeancierExiste([echeance({ payment_type: 'rent' })])).toBe(true);
  });
});
