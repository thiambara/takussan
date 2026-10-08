import { describe, it, expect } from 'vitest';

import fr from '@/messages/fr.json';

import {
  INVOICE_STATUS_TONE,
  PAYMENT_STATUS_TONE,
  PAYOUT_STATUS_TONE,
} from '../constants';

/**
 * TCK-292 — les tables de libellés françaises ont quitté `constants.ts` pour le DICTIONNAIRE.
 * Ce qui reste à garder est exactement ce que ces trois cas gardaient déjà : que CHAQUE valeur
 * d'enum ait un libellé, et que les libellés français n'aient pas bougé. On lit donc `fr.json`
 * à la place de la table — les assertions françaises, elles, sont intactes.
 */
const PAYMENT_STATUS_LABEL = fr.payments.status;
const INVOICE_STATUS_LABEL = fr.payments.invoiceStatus;
const PAYOUT_STATUS_LABEL = fr.payments.payoutStatus;

describe('status dictionaries', () => {
  it('maps every enum value of every status family to a French label', () => {
    for (const key of Object.keys(PAYMENT_STATUS_TONE)) {
      expect(PAYMENT_STATUS_LABEL[key as keyof typeof PAYMENT_STATUS_LABEL]).toBeTruthy();
    }
    for (const key of Object.keys(PAYOUT_STATUS_TONE)) {
      expect(PAYOUT_STATUS_LABEL[key as keyof typeof PAYOUT_STATUS_LABEL]).toBeTruthy();
    }
  });

  it('dit « réussi » pour un paiement, une facture et un reversement aboutis (TCK-358)', () => {
    // « Payé » était un `Badge` primaire plein : la couleur de l'action, pas celle du succès.
    expect(PAYMENT_STATUS_TONE.paid).toBe('success');
    expect(INVOICE_STATUS_TONE.paid).toBe('success');
    expect(PAYOUT_STATUS_TONE.completed).toBe('success');
  });

  it('covers all payment statuses', () => {
    expect(PAYMENT_STATUS_LABEL.paid).toBeDefined();
    expect(PAYMENT_STATUS_LABEL.pending).toBeDefined();
    expect(PAYMENT_STATUS_LABEL.failed).toBeDefined();
  });

  it('maps every invoice status to a label and a status tone', () => {
    for (const key of Object.keys(INVOICE_STATUS_TONE) as Array<
      keyof typeof INVOICE_STATUS_TONE
    >) {
      expect(INVOICE_STATUS_LABEL[key]).toBeTruthy();
      expect(INVOICE_STATUS_TONE[key]).toBeDefined();
    }
  });

  it('labels every payout status in French', () => {
    expect(PAYOUT_STATUS_LABEL.completed).toMatch(/Effectué/);
    expect(PAYOUT_STATUS_LABEL.failed).toMatch(/Échoué/);
  });
});
