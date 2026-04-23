import { describe, it, expect } from 'vitest';
import { bookingRequestSchema } from '../schemas/booking';
import { createLeaseSchema, guarantorSchema, leasePaymentSchema } from '../schemas/lease';
import { isAllowedAttachment, sendMessageSchema } from '../schemas/message';

describe('bookingRequestSchema', () => {
  const base = {
    property_id: 1,
    start_date: '2026-05-01',
    end_date: '2026-05-05',
    guests: 2,
    accept_terms: true,
  };

  it('accepts a well-formed booking', () => {
    const r = bookingRequestSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rejects end_date ≤ start_date', () => {
    const r = bookingRequestSchema.safeParse({ ...base, end_date: '2026-05-01' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('end_date'))).toBe(true);
    }
  });

  it('requires accept_terms', () => {
    const r = bookingRequestSchema.safeParse({ ...base, accept_terms: false });
    expect(r.success).toBe(false);
  });

  it('caps guests at 20', () => {
    const r = bookingRequestSchema.safeParse({ ...base, guests: 21 });
    expect(r.success).toBe(false);
  });
});

describe('createLeaseSchema', () => {
  const rentBase = {
    property_id: 1,
    tenant_id: 2,
    landlord_id: 3,
    type: 'residential_rent' as const,
    start_date: '2026-05-01',
    monthly_rent: 250000,
    deposit_amount: 500000,
    currency: 'XOF' as const,
    payment_frequency: 'monthly' as const,
  };

  it('accepts a minimal residential lease', () => {
    const r = createLeaseSchema.safeParse(rentBase);
    expect(r.success).toBe(true);
  });

  it('requires sale_price for sale type', () => {
    const r = createLeaseSchema.safeParse({
      ...rentBase,
      type: 'sale',
      monthly_rent: undefined,
    });
    expect(r.success).toBe(false);
  });

  it('requires monthly_rent for rental types', () => {
    const r = createLeaseSchema.safeParse({
      ...rentBase,
      monthly_rent: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe('guarantorSchema', () => {
  it('accepts minimal info (first + last name)', () => {
    const r = guarantorSchema.safeParse({
      first_name: 'Aminata',
      last_name: 'Diop',
    });
    expect(r.success).toBe(true);
  });

  it('rejects invalid email format', () => {
    const r = guarantorSchema.safeParse({
      first_name: 'X',
      last_name: 'Y',
      email: 'not-an-email',
    });
    expect(r.success).toBe(false);
  });
});

describe('leasePaymentSchema', () => {
  it('accepts a well-formed rent payment', () => {
    const r = leasePaymentSchema.safeParse({
      amount: 250000,
      payment_method: 'mobile_money',
      payment_type: 'rent',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
    });
    expect(r.success).toBe(true);
  });

  it('rejects non-positive amount', () => {
    const r = leasePaymentSchema.safeParse({
      amount: 0,
      payment_method: 'cash',
      period_start: '2026-05-01',
      period_end: '2026-05-31',
    });
    expect(r.success).toBe(false);
  });
});

describe('sendMessageSchema', () => {
  it('requires non-empty content', () => {
    expect(sendMessageSchema.safeParse({ content: '' }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ content: 'Bonjour !' }).success).toBe(true);
  });

  it('rejects content exceeding 4000 chars', () => {
    const huge = 'a'.repeat(4001);
    expect(sendMessageSchema.safeParse({ content: huge }).success).toBe(false);
  });
});

describe('isAllowedAttachment', () => {
  function makeFile(size: number, type: string): File {
    return new File(['x'], 'a.txt', { type });
    // Note: File size is controlled via the chunks in the first arg; we
    // patch it manually below for determinism.
  }

  it('rejects files > 10 MB', () => {
    const file = new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', {
      type: 'application/pdf',
    });
    const r = isAllowedAttachment(file);
    expect(r.ok).toBe(false);
  });

  it('rejects disallowed mime types', () => {
    const f = makeFile(100, 'application/zip');
    expect(isAllowedAttachment(f).ok).toBe(false);
  });

  it('accepts images and PDFs under the limit', () => {
    const png = new File([new Uint8Array(100)], 'a.png', { type: 'image/png' });
    const pdf = new File([new Uint8Array(100)], 'a.pdf', { type: 'application/pdf' });
    expect(isAllowedAttachment(png).ok).toBe(true);
    expect(isAllowedAttachment(pdf).ok).toBe(true);
  });
});
