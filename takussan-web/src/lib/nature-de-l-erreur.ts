import { ApiError } from '@/lib/api';

/**
 * TCK-2814 — ce qu'une lecture en erreur dit à la personne, et si « Réessayer » a un sens.
 *
 *  · `refus` (403) : l'objet relève d'un autre espace, ou d'un droit absent ;
 *  · `introuvable` (404) : l'objet n'existe pas, ou plus ;
 *  · `panne` : tout le reste — 5xx, réseau, délai, erreur qui n'est pas une `ApiError`.
 *
 * Seule une panne se répare en réessayant. `QueryBoundary` (TCK-2751), `DataState`, `ErreurDeLecture` et
 * les fiches du bail et du document (TCK-2807) en jugent tous ici. Restent des copies en ligne, hors
 * TCK-2814 : `BookingDetail` et `VisitDetail` (403 seul) — à faire passer par ici, pas à recopier.
 */
export type NatureDeLErreur = 'panne' | 'refus' | 'introuvable';

export function natureDeLErreur(erreur: unknown): NatureDeLErreur {
  if (erreur instanceof ApiError) {
    if (erreur.status === 403) return 'refus';
    if (erreur.status === 404) return 'introuvable';
  }
  return 'panne';
}

/**
 * L'erreur à montrer quand un bloc lit plusieurs requêtes à la fois (les documents d'un bail : déposés
 * ET générés). Une panne l'emporte : si l'une des lectures peut se réparer en réessayant, la reprise
 * est proposée — elle relit tout. Sinon, la première erreur. `null` si aucune lecture n'a échoué.
 */
export function erreurAMontrer(...erreurs: readonly unknown[]): unknown {
  const presentes = erreurs.filter((e) => e !== null && e !== undefined);
  return presentes.find((e) => natureDeLErreur(e) === 'panne') ?? presentes[0] ?? null;
}
