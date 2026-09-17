import type { PropertyDetail } from '@/types/property';

/** Fraction du total proposée en acompte (features.md §1.3), en pour cent. */
export const BOOKING_DEPOSIT_PERCENT = 30;

/**
 * TCK-530 — ce que le tunnel de réservation courte durée affiche pour un bien.
 *
 * - `stay` : location `daily` (prix × nuits) ou `weekly` (prix × nuits / 7). `total` vaut 0 tant
 *   que les dates ne couvrent aucune nuit.
 * - `flat` : vente, ou type de contrat absent — le prix affiché, sans nuits.
 * - `long_term` : location `monthly` / `yearly`, ou période absente (le modèle la ramène à
 *   `monthly`). Relève du bail (features §1.4) : **aucun montant**, le tunnel rend un état vide.
 *
 * ⚠ Estimation d'AFFICHAGE. Le serveur recalcule les deux montants
 * (`App\Services\Booking\BookingQuote`) et le tunnel ne les lui envoie pas. La règle d'arrondi est
 * la même des deux côtés — au demi supérieur, à l'unité mineure de la devise — pour que le montant
 * vu soit le montant enregistré.
 */
export type BookingQuote =
  | {
      readonly kind: 'stay';
      readonly period: 'daily' | 'weekly';
      readonly nights: number;
      readonly total: number;
      readonly deposit: number;
    }
  | { readonly kind: 'flat'; readonly total: number; readonly deposit: number }
  | { readonly kind: 'long_term' };

/** XOF et XAF n'ont pas de sous-unité (`Currency::decimalPlaces()` côté API). */
const DEVISES_SANS_SOUS_UNITE = new Set(['XOF', 'XAF']);

type BienTarife = Pick<PropertyDetail, 'price' | 'currency' | 'contract_type' | 'rent_period'>;

export function quoteBooking(property: BienTarife, nights: number): BookingQuote {
  // Calcul entier en centimes : le prix arrive en nombre JSON, une seule conversion l'arrondit.
  const priceCents = Math.round(property.price * 100);
  const step = DEVISES_SANS_SOUS_UNITE.has(property.currency ?? 'XOF') ? 100 : 1;

  if (property.contract_type !== 'rent') {
    // Arrondi à l'unité mineure, comme l'API : un prix XOF à centimes rendait un total à centimes.
    return { kind: 'flat', ...amounts(roundHalfUp(priceCents, step) * step, step) };
  }

  if (property.rent_period !== 'daily' && property.rent_period !== 'weekly') {
    return { kind: 'long_term' };
  }

  const divisor = property.rent_period === 'weekly' ? 7 : 1;
  const safeNights = Math.max(0, Math.floor(nights));
  const totalCents = roundHalfUp(priceCents * safeNights, divisor * step) * step;

  return { kind: 'stay', period: property.rent_period, nights: safeNights, ...amounts(totalCents, step) };
}

function amounts(totalCents: number, step: number): { total: number; deposit: number } {
  const depositCents = roundHalfUp(totalCents * BOOKING_DEPOSIT_PERCENT, 100 * step) * step;
  return { total: totalCents / 100, deposit: depositCents / 100 };
}

/** round(a / b), demi vers le haut, pour a ≥ 0 et b > 0 — même règle que l'API. */
function roundHalfUp(numerator: number, denominator: number): number {
  return Math.floor((2 * numerator + denominator) / (2 * denominator));
}
