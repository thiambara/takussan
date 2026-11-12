import type { PropertyVisit } from '@/types/visit';

/**
 * TCK-075 — le client note sa visite (1 à 5) dans les 24 h qui suivent sa clôture
 * (`config('visits.feedback_window_hours')`, rejugé par `PropertyVisitController::feedback` :
 * 422 `visit.feedback_window_closed`).
 *
 * TCK-2587 (lot C) — sortie de `VisitDetail` : la fiche et « Mes visites » lisent UNE règle. Deux
 * copies, c'était une carte d'avis qui s'ouvre sur la liste et se dit fermée sur la fiche.
 */
export const FENETRE_D_AVIS_HEURES = 24;

const HEURE_MS = 3600 * 1000;

/** `true` tant que l'avis peut être donné : visite terminée, clôturée depuis 24 h au plus. */
export function avisOuvert(visite: Pick<PropertyVisit, 'status' | 'completed_at'>, maintenant: number = Date.now()): boolean {
  return heuresRestantesPourLAvis(visite, maintenant) !== null;
}

/**
 * Les heures qu'il reste pour donner l'avis, arrondies à l'heure entamée (« encore 19 h ») ;
 * `null` quand la fenêtre est fermée ou n'a jamais été ouverte.
 */
export function heuresRestantesPourLAvis(visite: Pick<PropertyVisit, 'status' | 'completed_at'>, maintenant: number = Date.now()): number | null {
  if (visite.status !== 'completed' || !visite.completed_at) return null;
  const close = new Date(visite.completed_at).getTime();
  if (Number.isNaN(close)) return null;
  const reste = close + FENETRE_D_AVIS_HEURES * HEURE_MS - maintenant;
  if (reste < 0) return null;
  return Math.max(1, Math.ceil(reste / HEURE_MS));
}

/** L'avis du client est-il déjà donné ? `rating` est la colonne que l'avis du client écrit. */
export function avisDonne(visite: Pick<PropertyVisit, 'rating'>): boolean {
  return visite.rating != null;
}
