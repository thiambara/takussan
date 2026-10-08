/**
 * TCK-589 — l'intention « réserver ce bien », portée par l'URL de la fiche à travers la connexion
 * ou l'inscription : `/properties/{slug}?action=reserver&debut=AAAA-MM-JJ&fin=AAAA-MM-JJ`.
 *
 * Un visiteur anonyme qui cliquait « Réserver » repartait, une fois son compte créé, d'une fiche
 * fermée et d'un formulaire vide. L'URL est le seul transport qui survit à `redirect=`, à la
 * vérification de l'e-mail et à `/onboarding/intention`.
 */
export interface IntentionReservation {
  readonly debut: string;
  readonly fin: string;
}

const PARAM_ACTION = 'action';
const ACTION_RESERVER = 'reserver';
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function dateValide(brute: string | null): string {
  if (brute === null || !DATE_ISO.test(brute)) return '';
  return Number.isNaN(Date.parse(`${brute}T00:00:00Z`)) ? '' : brute;
}

/** Le chemin de la fiche qui rouvre la boîte de réservation, dates comprises quand il y en a. */
export function cheminIntentionReservation(
  slug: string,
  dates: Partial<IntentionReservation> = {},
): string {
  const params = new URLSearchParams({ [PARAM_ACTION]: ACTION_RESERVER });
  const debut = dateValide(dates.debut ?? null);
  const fin = dateValide(dates.fin ?? null);
  if (debut) params.set('debut', debut);
  if (fin) params.set('fin', fin);
  return `/properties/${slug}?${params.toString()}`;
}

/**
 * L'intention lue dans une chaîne de requête, `null` sans `action=reserver`. Une date illisible
 * est ignorée — vide plutôt que fausse : le formulaire la redemandera.
 */
export function lireIntentionReservation(recherche: string): IntentionReservation | null {
  const params = new URLSearchParams(recherche);
  if (params.get(PARAM_ACTION) !== ACTION_RESERVER) return null;
  const debut = dateValide(params.get('debut'));
  const fin = dateValide(params.get('fin'));
  // Une fin qui précède l'arrivée ne se pré-remplit pas : ce serait un séjour de zéro nuit.
  return { debut, fin: debut && fin && fin <= debut ? '' : fin };
}

/** L'URL sans l'intention : rouverte une fois, elle ne doit pas rouvrir la boîte à chaque rechargement. */
export function sansIntentionReservation(url: string): string {
  const cible = new URL(url);
  for (const cle of [PARAM_ACTION, 'debut', 'fin']) cible.searchParams.delete(cle);
  return `${cible.pathname}${cible.search}${cible.hash}`;
}
