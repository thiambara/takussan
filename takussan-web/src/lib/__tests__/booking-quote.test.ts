import { describe, expect, it } from 'vitest';

import { quoteBooking } from '@/lib/booking-quote';

/** TCK-530 — mêmes cas que `tests/Feature/Api/BookingPricingTest.php` : le montant vu est le montant enregistré. */
const rent = (rent_period: 'daily' | 'weekly' | 'monthly' | 'yearly' | null, price: number, currency = 'XOF') =>
  ({ contract_type: 'rent', rent_period, price, currency }) as const;

describe('quoteBooking', () => {
  it('daily : prix × nuits, acompte 30 % (AC1)', () => {
    expect(quoteBooking(rent('daily', 20_000), 3)).toEqual({
      kind: 'stay', period: 'daily', nights: 3, total: 60_000, deposit: 18_000,
    });
  });

  it('weekly : proratisé par 7', () => {
    expect(quoteBooking(rent('weekly', 70_000), 10)).toMatchObject({ total: 100_000, deposit: 30_000 });
  });

  it('XOF : arrondi au franc, demi vers le haut', () => {
    // 50 000 × 3 / 7 = 21 428,57… ; 30 % de 21 429 = 6 428,7.
    expect(quoteBooking(rent('weekly', 50_000), 3)).toMatchObject({ total: 21_429, deposit: 6_429 });
  });

  it('EUR : garde les centimes', () => {
    expect(quoteBooking(rent('daily', 99.99, 'EUR'), 3)).toMatchObject({ total: 299.97, deposit: 89.99 });
  });

  it.each(['monthly', 'yearly', null] as const)('%s : aucun montant (AC2)', (period) => {
    expect(quoteBooking(rent(period, 250_000), 10)).toEqual({ kind: 'long_term' });
  });

  it('vente : le prix affiché', () => {
    expect(
      quoteBooking({ contract_type: 'sale', rent_period: null, price: 45_000_000, currency: 'XOF' }, 0),
    ).toEqual({ kind: 'flat', total: 45_000_000, deposit: 13_500_000 });
  });

  it('sans nuit, un séjour vaut 0', () => {
    expect(quoteBooking(rent('daily', 20_000), 0)).toMatchObject({ total: 0, deposit: 0 });
  });
});
