import { describe, it, expect } from 'vitest';

import { createInvoiceSchema, createPayoutSchema } from '../payment';

describe('createInvoiceSchema', () => {
  const baseInvoice = {
    customer_id: 10,
    issue_date: '2026-04-23',
    items: [{ description: 'Loyer avril', quantity: 1, unit_price: 150000 }],
    currency: 'XOF' as const,
  };

  it('accepts a minimal valid invoice', () => {
    const result = createInvoiceSchema.safeParse(baseInvoice);
    expect(result.success).toBe(true);
  });

  it('rejects an invoice without any item', () => {
    const result = createInvoiceSchema.safeParse({ ...baseInvoice, items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a due_date earlier than issue_date', () => {
    const result = createInvoiceSchema.safeParse({
      ...baseInvoice,
      due_date: '2026-04-22',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('due_date');
    }
  });

  it('requires invoiceable_type and invoiceable_id together', () => {
    const result = createInvoiceSchema.safeParse({
      ...baseInvoice,
      invoiceable_type: 'lease',
      // invoiceable_id missing on purpose
    });
    expect(result.success).toBe(false);
  });

  it('accepts both invoiceable_type and invoiceable_id together', () => {
    const result = createInvoiceSchema.safeParse({
      ...baseInvoice,
      invoiceable_type: 'lease',
      invoiceable_id: 4,
    });
    expect(result.success).toBe(true);
  });

  it('rejects tax_rate > 100', () => {
    const result = createInvoiceSchema.safeParse({ ...baseInvoice, tax_rate: 120 });
    expect(result.success).toBe(false);
  });
});

describe('createPayoutSchema', () => {
  const basePayout = {
    landlord_id: 5,
    gross_amount: 200000,
    commission_amount: 20000,
    fees_amount: 0,
    currency: 'XOF' as const,
  };

  it('accepts a valid payout with positive net amount', () => {
    const result = createPayoutSchema.safeParse(basePayout);
    expect(result.success).toBe(true);
  });

  it('rejects a payout where commission + fees wipes out the gross', () => {
    const result = createPayoutSchema.safeParse({
      ...basePayout,
      commission_amount: 200000,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('gross_amount');
    }
  });

  it('rejects a period_end earlier than period_start', () => {
    const result = createPayoutSchema.safeParse({
      ...basePayout,
      period_start: '2026-04-01',
      period_end: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('requires a positive gross_amount', () => {
    const result = createPayoutSchema.safeParse({ ...basePayout, gross_amount: 0 });
    expect(result.success).toBe(false);
  });
});
