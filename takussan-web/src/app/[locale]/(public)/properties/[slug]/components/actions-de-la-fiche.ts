import { getPrimaryCtaForProperty } from '@/lib/property-cta';
import type { ContractType, PropertyOwnerLite, RentPeriod } from '@/types/property';

/**
 * TCK-2501 — « Le prix d'abord » : QUI la fiche propose de joindre, et PAR QUOI elle commence.
 *
 * Deux décisions de l'audit UX (2026-11-08, `docs/qa/audit-ux-2026-11/01-site-public.md`) :
 *
 *   · **4a — WhatsApp au premier rang, seulement quand le contact l'a.** Sinon Appeler s'il a un
 *     numéro, sinon Écrire (la messagerie). `null` : personne à joindre — le visiteur est lui-même
 *     le destinataire (TCK-500), et la barre ne garde que l'action du contrat.
 *   · **3a — l'action primaire d'une location longue est la VISITE.** Le dossier (« Postuler ») vient
 *     après elle, en second. Une vente garde « Faire une offre », une location courte « Réserver » :
 *     on ne visite pas une chambre louée pour deux nuits, et le ticket ne change que la location au
 *     dossier.
 *
 * Fonctions pures : la barre basse (mobile), le bloc de contact mobile et la carte de réservation
 * (bureau) en tirent les mêmes réponses — trois surfaces qui ne peuvent plus diverger.
 */
export type CanalDeLaFiche = 'whatsapp' | 'call' | 'message';

export function canalPrincipal(
  contact: Pick<PropertyOwnerLite, 'has_phone' | 'has_whatsapp'> | null | undefined,
  peutEcrire: boolean,
): CanalDeLaFiche | null {
  if (contact?.has_whatsapp === true) return 'whatsapp';
  if (contact?.has_phone === true) return 'call';
  return peutEcrire ? 'message' : null;
}

export type ActionDuContrat = 'visit' | 'offer' | 'reserve' | 'apply';

export interface ActionsDuContrat {
  readonly primaire: ActionDuContrat;
  readonly secondaire: ActionDuContrat;
}

export function actionsDuContrat(property: {
  contract_type: ContractType | null;
  rent_period?: RentPeriod | null;
}): ActionsDuContrat {
  const cta = getPrimaryCtaForProperty(property).action;
  if (cta === 'apply') return { primaire: 'visit', secondaire: 'apply' };
  return { primaire: cta, secondaire: 'visit' };
}
