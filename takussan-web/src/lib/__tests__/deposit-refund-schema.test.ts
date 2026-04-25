import { describe, expect, it } from 'vitest';
import { buildDepositRefundSchema } from '../schemas/lease';

/**
 * TCK-088 — covers the conditional invariants of the refund modal schema:
 * the reason becomes mandatory iff the user is reducing the proposed
 * amount, and the amount is capped at the remaining deposit.
 */
describe('buildDepositRefundSchema', () => {
  const REMAINING = 500_000;
  const schema = buildDepositRefundSchema(REMAINING);

  it('accepts a full refund without reason', () => {
    const r = schema.safeParse({ amount: REMAINING });
    expect(r.success).toBe(true);
  });

  it('rejects a partial refund without a reason', () => {
    const r = schema.safeParse({ amount: 200_000 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('reason'))).toBe(true);
    }
  });

  it('accepts a partial refund when a reason is provided', () => {
    const r = schema.safeParse({ amount: 200_000, reason: 'Réparations' });
    expect(r.success).toBe(true);
  });

  it('rejects an amount exceeding the remaining balance', () => {
    const r = schema.safeParse({ amount: 600_000, reason: '—' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('amount'))).toBe(true);
    }
  });

  it('rejects a non-positive amount', () => {
    const r = schema.safeParse({ amount: 0 });
    expect(r.success).toBe(false);
  });
});
