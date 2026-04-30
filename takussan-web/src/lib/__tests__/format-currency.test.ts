import { describe, it, expect } from 'vitest';
import {
  CURRENCY_METADATA,
  currencyLocale,
  currencySymbol,
  formatCurrency,
} from '../format/currency';

/**
 * Helper — replace any non-ASCII space character with a regular ASCII space
 * so assertions stay deterministic across ICU/Intl builds (Node 22+ uses
 * U+202F as the grouping separator, older runtimes use U+00A0).
 */
function normalize(value: string): string {
  return value.replace(/[   ]/gu, ' ');
}

describe('formatCurrency (TCK-084 multi-currency)', () => {
  it('formats XOF with NBSP grouping and trailing F CFA symbol (AC4)', () => {
    expect(normalize(formatCurrency(150_000, 'XOF'))).toBe('150 000 F CFA');
  });

  it('formats EUR with comma decimal and trailing € symbol (AC5)', () => {
    expect(normalize(formatCurrency(150_000.5, 'EUR'))).toBe('150 000,50 €');
  });

  it('formats USD with comma grouping and leading $ symbol (AC6)', () => {
    // USD output is pure ASCII (`en-US` locale, comma grouping).
    expect(formatCurrency(150_000, 'USD')).toBe('$150,000.00');
  });

  it('defaults to XOF when no currency is given', () => {
    expect(normalize(formatCurrency(1234))).toBe('1 234 F CFA');
  });

  it('returns an empty string for null / undefined / NaN', () => {
    expect(formatCurrency(null)).toBe('');
    expect(formatCurrency(undefined)).toBe('');
    expect(formatCurrency(Number.NaN)).toBe('');
  });

  it('falls back to XOF for an empty / unknown currency code', () => {
    const fallback = formatCurrency(1000, '');
    const reference = formatCurrency(1000);
    expect(fallback).toBe(reference);

    const unknown = formatCurrency(1000, 'JPY');
    expect(unknown).toBe(reference);
  });

  it('lowercases currency input is also accepted', () => {
    expect(normalize(formatCurrency(42, 'eur'))).toBe('42,00 €');
  });

  it('honours an explicit locale override', () => {
    // EUR with en-US grouping/decimal — uncommon but supported.
    expect(formatCurrency(1000, 'EUR', { locale: 'en-US' })).toMatch(/1,000\.00/);
  });

  it('exposes metadata helpers used by <Money> and the agency settings preview', () => {
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('XOF')).toBe('F CFA');
    expect(currencyLocale('USD')).toBe('en-US');
    expect(CURRENCY_METADATA.XOF.decimalPlaces).toBe(0);
    expect(CURRENCY_METADATA.EUR.decimalPlaces).toBe(2);
  });
});
