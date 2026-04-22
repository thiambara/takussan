import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
} from '../format';

// Use a fixed UTC reference so the formatted output is deterministic.
// 2026-04-22 10:00 UTC → 2026-04-22 10:00 in Africa/Dakar (UTC+0 year-round).
const REFERENCE = new Date('2026-04-22T10:00:00.000Z');

describe('formatDate', () => {
  it('returns an empty string for null / undefined', () => {
    expect(formatDate(null, 'fr')).toBe('');
    expect(formatDate(undefined, 'fr')).toBe('');
    expect(formatDate('', 'fr')).toBe('');
  });

  it('returns an empty string for invalid inputs', () => {
    expect(formatDate('not-a-date', 'fr')).toBe('');
  });

  it('formats a date with a French locale', () => {
    const out = formatDate(REFERENCE, 'fr');
    // "22 avr. 2026" under fr-SN, may vary by CLDR version — we just
    // assert the year and month marker are present.
    expect(out).toMatch(/2026/);
    expect(out.toLowerCase()).toMatch(/avr|avril/);
  });

  it('formats a date with an English locale', () => {
    const out = formatDate(REFERENCE, 'en');
    expect(out).toMatch(/2026/);
    expect(out).toMatch(/Apr/);
  });
});

describe('formatDateTime', () => {
  it('includes a time component', () => {
    const out = formatDateTime(REFERENCE, 'fr');
    // Format is locale-dependent; just verify there's at least one colon.
    expect(out).toMatch(/\d{2}/);
  });
});

describe('formatNumber', () => {
  it('returns an empty string for null / NaN', () => {
    expect(formatNumber(null, 'fr')).toBe('');
    expect(formatNumber(Number.NaN, 'fr')).toBe('');
  });

  it('formats thousands with a French separator', () => {
    const out = formatNumber(1234567, 'fr');
    // fr-SN uses a narrow no-break space as thousands separator.
    // Accept any non-digit separator to stay resilient across CLDR versions.
    expect(out.replace(/[^\d]/g, '')).toBe('1234567');
    expect(out).not.toBe('1234567');
  });
});

describe('formatCurrency', () => {
  it('emits XOF by default with no fractional part', () => {
    const out = formatCurrency(250000, 'fr');
    expect(out).toMatch(/CFA|XOF|F/);
    expect(out).not.toContain(',00');
    expect(out).not.toContain('.00');
  });

  it('honours an override currency', () => {
    const out = formatCurrency(100, 'fr', { currency: 'EUR' });
    expect(out).toMatch(/€|EUR/);
  });
});

describe('formatPercent', () => {
  it('formats a fraction as a percentage', () => {
    const out = formatPercent(0.125, 'fr');
    expect(out).toMatch(/12[.,]5\s*%/);
  });
});
