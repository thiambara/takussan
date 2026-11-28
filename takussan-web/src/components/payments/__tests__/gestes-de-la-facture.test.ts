import { describe, expect, it } from 'vitest';

import { AUCUN_GESTE_DE_FACTURE, gestesDeLaFacture } from '../gestes-de-la-facture';
import type { Invoice, InvoiceAbilities } from '@/types/invoice';

/**
 * TCK-3011 (ADR-0139) — les gestes de la facture suivent `abilities`, jamais le statut. AC2 : une facture
 * non brouillon ne propose pas les gestes de brouillon — c'est l'API qui le dit (`send: false`), et la
 * fonction ne le recalcule pas : un statut `draft` avec `send: false` n'offre pas l'envoi non plus.
 */
function facture(status: Invoice['status'], abilities?: InvoiceAbilities): Pick<Invoice, 'abilities' | 'status'> {
  return { status, abilities };
}

describe('gestesDeLaFacture', () => {
  it('sans `abilities`, aucun geste — même sur un brouillon', () => {
    expect(gestesDeLaFacture(facture('draft'))).toEqual(AUCUN_GESTE_DE_FACTURE);
    expect(gestesDeLaFacture(null)).toEqual(AUCUN_GESTE_DE_FACTURE);
  });

  it('AC2 — une facture émise : ni envoi ni geste de brouillon, mais le paiement en ligne', () => {
    expect(gestesDeLaFacture(facture('sent', { send: false, mark_paid: true, cancel: true, pay: true }))).toEqual({
      envoyer: false,
      marquerPayee: true,
      annuler: true,
      payerEnLigne: true,
    });
  });

  it('un brouillon ne se paie pas en ligne quand l’API le refuse', () => {
    expect(gestesDeLaFacture(facture('draft', { send: true, mark_paid: true, cancel: true, pay: false })).payerEnLigne).toBe(false);
  });

  it('le statut ne décide de rien : un brouillon sans `send` n’offre pas l’envoi', () => {
    expect(gestesDeLaFacture(facture('draft', { send: false, mark_paid: false, cancel: false, pay: false }))).toEqual(AUCUN_GESTE_DE_FACTURE);
  });
});
