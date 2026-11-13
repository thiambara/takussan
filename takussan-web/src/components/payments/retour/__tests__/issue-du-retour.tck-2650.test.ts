/**
 * TCK-2650 — AC1 : la table de décision du retour de passerelle. Chaque statut serveur est croisé avec
 * chaque indice d'URL : seul `paid` côté serveur rend « confirmé », et aucun indice ne le rend.
 */
import { describe, expect, it } from 'vitest';

import { issueDuRetour, lireLeLien, type EntreeDuRetour } from '../issue-du-retour';

const LIEN = { type: 'lease-payments', id: 12 } as const;
const INDICES = [null, 'success', 'paid', 'pending', 'failed', 'cancelled', 'n’importe quoi'] as const;

function decider(statut: string | null, indice: string | null, extra: Partial<EntreeDuRetour> = {}) {
  return issueDuRetour({ lien: LIEN, serveur: { status: statut }, erreur: null, indice, ...extra });
}

describe('TCK-2650 — l’issue du retour vient du serveur (AC1)', () => {
  it.each(INDICES)('statut serveur `paid`, indice %s : confirmé, définitif', (indice) => {
    expect(decider('paid', indice)).toEqual({ issue: 'confirme', terminale: true });
  });

  it.each(['pending', 'partially_paid', 'late', null, '', 'inconnu'])(
    'statut serveur %s : jamais « confirmé », et l’interrogation continue, quel que soit l’indice',
    (statut) => {
      for (const indice of INDICES) {
        const d = decider(statut, indice);
        expect(d.issue).not.toBe('confirme');
        expect(d.terminale).toBe(false);
      }
    },
  );

  it('`pending` + `status=success` : « en cours »', () => {
    expect(decider('pending', 'success')).toEqual({ issue: 'attente', terminale: false });
  });

  it('`pending` + `status=failed` (adresse d’annulation, TCK-1291) : « non abouti », sans arrêter l’interrogation', () => {
    expect(decider('pending', 'failed')).toEqual({ issue: 'echec', terminale: false });
    expect(decider('pending', 'cancelled')).toEqual({ issue: 'echec', terminale: false });
  });

  it.each(['failed', 'cancelled'])('statut serveur %s : non abouti, définitif, même avec `status=success`', (statut) => {
    for (const indice of INDICES) expect(decider(statut, indice)).toEqual({ issue: 'echec', terminale: true });
  });

  it('remboursement : `refund_pending` l’emporte sur `paid` comme sur `cancelled` ; `refunded` aussi', () => {
    expect(issueDuRetour({ lien: LIEN, serveur: { status: 'paid', refund_pending: true }, erreur: null, indice: 'success' }).issue).toBe('rembourse');
    expect(issueDuRetour({ lien: LIEN, serveur: { status: 'cancelled', refund_pending: true }, erreur: null, indice: null }).issue).toBe('rembourse');
    expect(decider('refunded', 'success')).toEqual({ issue: 'rembourse', terminale: true });
  });

  it.each([404, 403])('paiement introuvable ou d’un autre (%i) : lien invalide, sans relance — même avec `status=success`', (code) => {
    expect(issueDuRetour({ lien: LIEN, serveur: null, erreur: code, indice: 'success' })).toEqual({ issue: 'invalide', terminale: true });
  });

  it.each([500, 503, 0])('erreur %i (serveur ou réseau) : ni invalide ni confirmé — on attend et on réessaie', (code) => {
    expect(issueDuRetour({ lien: LIEN, serveur: null, erreur: code, indice: 'success' })).toEqual({ issue: 'attente', terminale: false });
  });

  it('pas encore de réponse : en cours', () => {
    expect(issueDuRetour({ lien: LIEN, serveur: null, erreur: null, indice: 'success' })).toEqual({ issue: 'attente', terminale: false });
  });

  it('sans lien lisible : invalide', () => {
    expect(issueDuRetour({ lien: null, serveur: { status: 'paid' }, erreur: null, indice: 'success' })).toEqual({ issue: 'invalide', terminale: true });
  });
});

describe('TCK-2650 — l’adresse de retour n’entre dans un chemin d’API qu’une fois lue', () => {
  const lire = (qs: string) => lireLeLien(new URLSearchParams(qs));

  it('les trois types connus, un identifiant entier positif', () => {
    expect(lire('payment_type=lease-payments&payment_id=999999&status=success')).toEqual({ type: 'lease-payments', id: 999999 });
    expect(lire('payment_type=booking-payments&payment_id=7')).toEqual({ type: 'booking-payments', id: 7 });
    expect(lire('payment_type=invoices&payment_id=3')).toEqual({ type: 'invoices', id: 3 });
  });

  it.each([
    'payment_id=12',
    'payment_type=lease-payments',
    'payment_type=admin/users&payment_id=12',
    'payment_type=..&payment_id=12',
    'payment_type=lease-payments&payment_id=12abc',
    'payment_type=lease-payments&payment_id=-3',
    'payment_type=lease-payments&payment_id=0',
    'payment_type=lease-payments&payment_id=1.5',
    'payment_type=lease-payments&payment_id=12%2F..%2Fx',
    'payment_type=lease-payments&payment_id=1234567890123456789',
    // `Number()` les lit comme des entiers : seule l'expression régulière les refuse.
    'payment_type=lease-payments&payment_id=1e3',
    'payment_type=lease-payments&payment_id=0x1F',
    'payment_type=lease-payments&payment_id=%2012',
  ])('refusé : %s', (qs) => {
    expect(lire(qs)).toBeNull();
  });
});
