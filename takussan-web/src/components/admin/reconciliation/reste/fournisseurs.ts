import { isPaymentProvider } from '@/lib/schemas/setting';
import type { Integration } from '@/types/setting';

/**
 * TCK-2675 — les fournisseurs de paiement CONNECTÉS de l'agence : une intégration ACTIVE d'un
 * fournisseur de paiement (Wave, Orange Money…), une fois chacun. Une intégration désactivée, ou
 * d'un autre service (SMS, e-mail), n'en est pas : « Connecté » ne s'écrit que d'après celles-ci.
 */
export function fournisseursConnectes(integrations: readonly Pick<Integration, 'provider' | 'is_active'>[]): string[] {
  return [...new Set(integrations.filter((i) => i.is_active && isPaymentProvider(i.provider)).map((i) => i.provider))];
}
