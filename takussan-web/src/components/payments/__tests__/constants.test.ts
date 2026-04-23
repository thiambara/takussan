import { describe, it, expect } from 'vitest';

import {
  commissionFromRate,
  computePayoutNet,
  INVOICE_STATUS_LABEL,
  INVOICE_STATUS_VARIANT,
  PAYMENT_STATUS_LABEL,
  PAYOUT_STATUS_LABEL,
} from '../constants';

describe('commissionFromRate', () => {
  it('returns 10% of 100000 as 10000', () => {
    expect(commissionFromRate(100000, 10)).toBe(10000);
  });

  it('clamps rate below 0 to 0', () => {
    expect(commissionFromRate(50000, -5)).toBe(0);
  });

  it('clamps rate above 100 to 100', () => {
    expect(commissionFromRate(1000, 250)).toBe(1000);
  });

  it('returns 0 for non-finite gross or rate', () => {
    expect(commissionFromRate(Number.NaN, 10)).toBe(0);
    expect(commissionFromRate(100, Number.NaN)).toBe(0);
  });
});

describe('computePayoutNet', () => {
  it('subtracts commission and fees from gross', () => {
    expect(computePayoutNet({ gross: 100000, commission: 10000, fees: 2000 })).toBe(
      88000,
    );
  });

  it('defaults commission and fees to 0 when omitted', () => {
    expect(computePayoutNet({ gross: 50000 })).toBe(50000);
  });

  it('can produce a negative net when the inputs are invalid', () => {
    expect(computePayoutNet({ gross: 1000, commission: 2000 })).toBe(-1000);
  });

  it('returns 0 for a non-finite gross', () => {
    expect(
      computePayoutNet({ gross: Number.POSITIVE_INFINITY, commission: 10 }),
    ).toBe(0);
  });
});

describe('status dictionaries', () => {
  it('covers all payment statuses', () => {
    expect(PAYMENT_STATUS_LABEL.paid).toBeDefined();
    expect(PAYMENT_STATUS_LABEL.pending).toBeDefined();
    expect(PAYMENT_STATUS_LABEL.failed).toBeDefined();
  });

  it('maps every invoice status to a label and a badge variant', () => {
    for (const key of Object.keys(INVOICE_STATUS_LABEL) as Array<
      keyof typeof INVOICE_STATUS_LABEL
    >) {
      expect(INVOICE_STATUS_LABEL[key]).toBeTruthy();
      expect(INVOICE_STATUS_VARIANT[key]).toBeDefined();
    }
  });

  it('labels every payout status in French', () => {
    expect(PAYOUT_STATUS_LABEL.completed).toMatch(/Effectué/);
    expect(PAYOUT_STATUS_LABEL.failed).toMatch(/Échoué/);
  });
});
