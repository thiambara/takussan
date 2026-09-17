import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { quoteBooking } from '@/lib/booking-quote';
import type { PropertyDetail } from '@/types/property';

/**
 * TCK-530 — concordance avec l'API : `takussan-api/tests/fixtures/booking-quote.json` est lu par
 * CE test et par `tests/Unit/Services/Booking/BookingQuoteConcordanceTest.php`. Le montant affiché
 * par le tunnel doit être, au centime près, celui que `BookingQuote` enregistre.
 */
interface Cas {
  readonly price: string;
  readonly currency: string;
  readonly period: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'sale' | null;
  readonly nights: number;
  readonly total: string | null;
  readonly deposit: string | null;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { cases } = JSON.parse(
  readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'booking-quote.json'), 'utf8'),
) as { cases: readonly Cas[] };

describe('quoteBooking — concordance avec BookingQuote (API)', () => {
  it('le fichier partagé porte des cas', () => {
    expect(cases.length).toBeGreaterThanOrEqual(20);
  });

  it.each(cases.map((c) => [`${c.price} ${c.currency} ${c.period} × ${c.nights}`, c] as const))('%s', (_, c) => {
    // Le prix arrive au front comme l'API le rend : `(float)` dans PropertyResource.
    const property = {
      price: Number(c.price),
      currency: c.currency,
      contract_type: c.period === 'sale' ? 'sale' : 'rent',
      rent_period: c.period === 'sale' ? null : c.period,
    } as Pick<PropertyDetail, 'price' | 'currency' | 'contract_type' | 'rent_period'>;

    const quote = quoteBooking(property, c.nights);

    if (c.total === null) {
      expect(quote).toEqual({ kind: 'long_term' });
      return;
    }
    expect(quote.kind).not.toBe('long_term');
    if (quote.kind === 'long_term') return;
    expect([quote.total, quote.deposit]).toEqual([Number(c.total), Number(c.deposit)]);
  });
});
