import type { ContractType, RentPeriod } from '@/types/property';

/**
 * TCK-165 — primary CTA for the public property detail booking card.
 *
 * The verb depends on the contract:
 * - `sale`                                                → "Faire une offre"
 * - `rent` + short-term period (`daily` / `weekly`)       → "Réserver"
 * - `rent` + long-term period (`monthly` / `yearly`)      → "Postuler"
 * - unknown / null                                        → "Réserver" (safe default)
 *
 * The `action` token tells the auth-required modal which copy variant
 * to render — same shape as the verb so the dialog stays in sync.
 */
export type PropertyCtaAction = 'offer' | 'reserve' | 'apply';

export interface PrimaryCta {
  readonly label: string;
  readonly action: PropertyCtaAction;
}

const SHORT_TERM_PERIODS: ReadonlySet<RentPeriod> = new Set(['daily', 'weekly']);

export function getPrimaryCtaForProperty(property: {
  contract_type: ContractType | null;
  rent_period?: RentPeriod | null;
}): PrimaryCta {
  if (property.contract_type === 'sale') {
    return { label: 'Faire une offre', action: 'offer' };
  }
  if (property.contract_type === 'rent') {
    if (property.rent_period && SHORT_TERM_PERIODS.has(property.rent_period)) {
      return { label: 'Réserver', action: 'reserve' };
    }
    return { label: 'Postuler', action: 'apply' };
  }
  return { label: 'Réserver', action: 'reserve' };
}
