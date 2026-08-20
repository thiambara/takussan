import type { ContractType, RentPeriod } from '@/types/property';

/**
 * TCK-165 — primary CTA for the public property detail booking card.
 *
 * The verb depends on the contract:
 * - `sale`                                                → `offer`   (« Faire une offre »)
 * - `rent` + short-term period (`daily` / `weekly`)       → `reserve` (« Réserver »)
 * - `rent` + long-term period (`monthly` / `yearly`)      → `apply`   (« Postuler »)
 * - unknown / null                                        → `reserve` (safe default)
 *
 * TCK-292 — « la donnée porte la CLÉ, le rendu la résout ». Ce module est une fonction pure
 * appelée hors composant : ni `useTranslations` ni `getTranslations` n'y est appelable. Il ne
 * porte donc plus le libellé, seulement le jeton `action` — qui EST la clé sous
 * {@link PRIMARY_CTA_NAMESPACE}. Le libellé se résout d'une ligne côté appelant :
 *
 * ```tsx
 * const t = useTranslations('property.detail');           // = PRIMARY_CTA_NAMESPACE
 * const cta = getPrimaryCtaForProperty(property);
 * <Button>{t(`primaryCta.${cta.action}`)}</Button>
 * ```
 *
 * Le jeton `action` servait déjà à choisir la variante de copie du modal d'authentification : il
 * n'a pas été inventé pour l'i18n, il était simplement doublé par un libellé français.
 */
export type PropertyCtaAction = 'offer' | 'reserve' | 'apply';

/** Espace de noms où vivent les trois libellés — `primaryCta.{action}` sous cette racine. */
export const PRIMARY_CTA_NAMESPACE = 'property.detail' as const;

export interface PrimaryCta {
  readonly action: PropertyCtaAction;
}

const SHORT_TERM_PERIODS: ReadonlySet<RentPeriod> = new Set(['daily', 'weekly']);

export function getPrimaryCtaForProperty(property: {
  contract_type: ContractType | null;
  rent_period?: RentPeriod | null;
}): PrimaryCta {
  if (property.contract_type === 'sale') {
    return { action: 'offer' };
  }
  if (property.contract_type === 'rent') {
    if (property.rent_period && SHORT_TERM_PERIODS.has(property.rent_period)) {
      return { action: 'reserve' };
    }
    return { action: 'apply' };
  }
  return { action: 'reserve' };
}
