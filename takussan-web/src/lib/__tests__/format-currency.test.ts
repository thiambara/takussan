import { describe, it, expect } from 'vitest';
import { formatCurrency } from '../format/currency';

describe('formatCurrency (TCK-078)', () => {
  it('defaults to XOF and 0 fraction digits', () => {
    const out = formatCurrency(1234567);
    // CFA franc display varies by CLDR: "F CFA" or "CFA"; we just assert
    // that the grouped integer shows up and that no decimal separator
    // precedes digits.
    expect(out).toMatch(/1\s234\s567/);
    expect(out).not.toMatch(/[.,]\d{2}/);
  });

  it('respects an explicit EUR currency', () => {
    const out = formatCurrency(42, 'EUR');
    expect(out).toMatch(/42/);
    expect(out).toMatch(/€|EUR/);
  });

  it('returns an empty string for null / undefined / NaN', () => {
    expect(formatCurrency(null)).toBe('');
    expect(formatCurrency(undefined)).toBe('');
    expect(formatCurrency(Number.NaN)).toBe('');
  });

  it('falls back to XOF when currency is an empty string', () => {
    const fallback = formatCurrency(1000, '');
    const reference = formatCurrency(1000);
    expect(fallback).toBe(reference);
  });

  it('accepts custom locale override', () => {
    const fr = formatCurrency(1000, 'USD', { locale: 'fr-FR' });
    const en = formatCurrency(1000, 'USD', { locale: 'en-US' });
    expect(fr).toMatch(/1\s000/);
    expect(en).toMatch(/\$1,000/);
  });
});
