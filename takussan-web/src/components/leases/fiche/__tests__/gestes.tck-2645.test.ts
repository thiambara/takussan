/**
 * TCK-2645 — le geste principal et les gestes de « ⋯ » d'un bail : un par état et par lecteur, tout
 * par `abilities` (jamais par `user.roles`), rien avant les capacités.
 */
import { describe, expect, it } from 'vitest';

import type { LeaseWithRelations } from '@/lib/queries/leases';
import type { LeaseAbilities, LeasePayment } from '@/types/lease';
import { echeancierExiste, gestePrincipal, gestesSecondaires } from '../gestes';

const GESTION: LeaseAbilities = {
  renew: true,
  review_rent: true,
  record_payment: true,
  refund_deposit: true,
  request_early_termination: true,
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
    expect(gestesSecondaires(bail({ abilities: undefined }), [])).toEqual([]);
  });

  it('gestion, bail actif : « Encaisser », l’échéance en retard présélectionnée', () => {
    const p = [echeance({ id: 9, status: 'paid' }), echeance({ id: 29, status: 'late', is_overdue: true, due_date: '2026-11-05' })];
    expect(gestePrincipal(bail(), ctx(p))).toEqual({ type: 'encaisser', paiement: 29 });
  });

  it('sans `record_payment`, la gestion n’a pas de geste principal', () => {
    expect(gestePrincipal(bail({ abilities: { ...GESTION, record_payment: false } }), ctx([]))).toBeNull();
  });

  it('brouillon : « Envoyer à la signature », bloqué avec sa raison pour un locataire sans compte', () => {
    expect(gestePrincipal(bail({ status: 'draft', can_request_signature: true }), ctx([]))).toEqual({ type: 'envoyer-signature', bloque: null });
    const sansCompte = bail({ status: 'draft', can_request_signature: true, tenant: { id: 1, user_id: null } });
    expect(gestePrincipal(sansCompte, ctx([]))).toEqual({ type: 'envoyer-signature', bloque: 'sans-compte' });
    expect(gestePrincipal(bail({ status: 'draft', can_request_signature: false }), ctx([]))).toBeNull();
  });

  it('en signature : le lecteur qui peut signer « Signe » ; la gestion relance par WhatsApp la partie qui n’a pas signé', () => {
    const enSignature = { status: 'pending_signature' as const, can_request_signature: true };
    expect(gestePrincipal(bail({ ...enSignature, can_sign_as: ['landlord'] }), ctx([]))).toEqual({ type: 'signer' });
    const relance = gestePrincipal(
      bail({ ...enSignature, can_sign_as: ['landlord'], signatures: [{ role: 'landlord', current: true } as never] }),
      ctx([]),
    );
    expect(relance).toEqual({ type: 'relancer-signature', role: 'tenant', telephone: '+221770000001', prenom: 'Fatou' });
  });

  it('en signature, sans numéro servi pour la partie qui n’a pas signé : aucun geste (aucun numéro neuf)', () => {
    const b = bail({ status: 'pending_signature', can_request_signature: true, tenant: { id: 1, user_id: 3, first_name: 'Fatou', phone: null } });
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

describe('gestesSecondaires — « ⋯ » et la carte Actions (TCK-2645)', () => {
  it('« Générer l’échéancier » seulement quand il n’existe pas, et jamais pendant le chargement', () => {
    expect(gestesSecondaires(bail(), [echeance({ payment_type: 'deposit' })])).toContain('generer');
    expect(gestesSecondaires(bail(), [echeance({ payment_type: 'rent' })])).not.toContain('generer');
    expect(gestesSecondaires(bail(), [echeance({ payment_type: 'charges' })])).not.toContain('generer');
    expect(gestesSecondaires(bail(), undefined)).not.toContain('generer');
  });

  it('« Générer l’échéancier » : seulement sur un bail actif, et avec `record_payment` (P228.01)', () => {
    const caution = [echeance({ payment_type: 'deposit' })];
    for (const status of ['pending_signature', 'terminated', 'expired', 'draft'] as const) {
      expect(gestesSecondaires(bail({ status }), caution), status).not.toContain('generer');
    }
    expect(gestesSecondaires(bail({ abilities: { ...GESTION, record_payment: false } }), caution)).not.toContain('generer');
  });

  it('l’ordre du ticket, la résiliation en dernier', () => {
    expect(gestesSecondaires(bail(), [echeance({})])).toEqual(['reviser', 'renouveler', 'document', 'resilier']);
  });

  it('le locataire a son préavis (et son dépôt de document), jamais la résiliation de la gestion', () => {
    expect(gestesSecondaires(bail({ abilities: LOCATAIRE }), [echeance({})])).toEqual(['document', 'preavis']);
  });

  it('restituer la caution : bail terminé, caution versée, capacité', () => {
    expect(gestesSecondaires(bail({ status: 'terminated' }), [])).toContain('restituer');
    expect(gestesSecondaires(bail({ status: 'terminated', deposit_amount: 0 }), [])).not.toContain('restituer');
    expect(gestesSecondaires(bail({ status: 'active' }), [])).not.toContain('restituer');
  });

  it('echeancierExiste : la caution seule ne compte pas', () => {
    expect(echeancierExiste([echeance({ payment_type: 'deposit' })])).toBe(false);
    expect(echeancierExiste([echeance({ payment_type: 'rent' })])).toBe(true);
  });
});
