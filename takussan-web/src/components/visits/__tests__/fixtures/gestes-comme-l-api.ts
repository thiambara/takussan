import type { PropertyVisit } from '@/types/visit';

/**
 * TCK-3005 (ADR-0139) — `abilities` d'une visite de test, complété COMME L'API LE SERT : une clé par geste,
 * policy ET état (`GestesDeLaVisite::peut*`). Les doublures des tests de la fiche ne posent que l'intention
 * (`manage` : le personnel qui gère la visite ; `feedback_customer` : le demandeur) ; ce module en dérive les
 * clés des gestes sur le statut de la visite, comme `PropertyVisitResource`. Une clé posée par le test gagne.
 *
 * `assign` ne se déduit pas (l'API le juge sur `crm.assign` dans l'agence du bien) : faux, sauf posé.
 */
const VIVANTS = new Set(['scheduled', 'confirmed']);

export function avecLesGestesDeLApi<V extends PropertyVisit | null>(v: V): V;
export function avecLesGestesDeLApi(v: PropertyVisit | null): PropertyVisit | null {
  const a = v?.abilities;
  if (!v || !a) return v;
  const statut = v.status ?? 'scheduled';
  const vivante = VIVANTS.has(statut);
  const gere = a.manage === true;
  const demandeur = a.feedback_customer === true;
  return {
    ...v,
    abilities: {
      confirm: (gere || a.confirm === true) && statut === 'scheduled',
      complete: gere && vivante,
      no_show: gere && vivante,
      cancel: (gere || demandeur) && vivante,
      reschedule: gere && vivante,
      claim: gere && vivante && v.agent_id == null,
      assign: false,
      propose: demandeur && vivante,
      ...a,
    },
  };
}
