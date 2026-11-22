/**
 * Les faits d'une ligne d'annuaire qui demandent une règle — TCK-2521.
 *
 * Isolés ici pour être éprouvés sans rendu : la règle du délai décide de ce qu'un chercheur lit
 * avant d'écrire, et une erreur d'arrondi y est une promesse fausse.
 */

/**
 * Les langues qu'un agent peut déclarer — le MIROIR de `takussan-api/config/directory.php`
 * (`languages`). L'API n'émet que des codes ; le libellé est au front (principe n° 5), sous
 * `publicProfileIndex.languages.<code>`.
 *
 * ⚠ La liste est recopiée, donc gardée : `__tests__/faits-de-profil.test.ts` relit la config PHP et
 * rougit sur un code ajouté d'un côté seulement — sans quoi une langue neuve s'afficherait en clé
 * brute, ou disparaîtrait sans bruit.
 */
export const LANGUES_DE_L_ANNUAIRE = ['fr', 'wo', 'en', 'ar', 'ff', 'es', 'pt', 'it', 'de'] as const;

export type LangueDeLAnnuaire = (typeof LANGUES_DE_L_ANNUAIRE)[number];

export function estLangueConnue(code: string): code is LangueDeLAnnuaire {
  return (LANGUES_DE_L_ANNUAIRE as readonly string[]).includes(code);
}

export type DelaiDeReponse =
  | { readonly unite: 'minutes'; readonly valeur: number }
  | { readonly unite: 'heures'; readonly valeur: number }
  | { readonly unite: 'jours'; readonly valeur: number };

const MINUTES_PAR_HEURE = 60;
const MINUTES_PAR_JOUR = 24 * MINUTES_PAR_HEURE;

/**
 * Le délai de réponse habituel, dans l'unité qu'on dirait à voix haute — ou `null`.
 *
 * ⚠ **`null` ne devient jamais un chiffre.** L'API rend `null` sous cinq conversations, et aussi
 * quand la médiane tombe sur un fil resté sans réponse plus de 24 h (décision 12 de la vague 1 :
 * « rien d'affiché plutôt qu'un chiffre flatteur »). Une valeur non finie ou négative est traitée
 * de même : la ligne n'affiche alors aucun délai, ni « — », ni « 0 min ».
 *
 * Arrondi au plus proche dans l'unité retenue, jamais sous 1 : une médiane de 0 minute (réponse
 * dans les trente secondes) se lit « ~1 min ». 90 minutes se lisent « ~2 h » ; 23 h 40 se lisent
 * « ~1 jour » plutôt que « ~24 h ».
 */
export function delaiDeReponse(minutes: number | null | undefined): DelaiDeReponse | null {
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes < 0) return null;

  if (minutes < MINUTES_PAR_HEURE) {
    return { unite: 'minutes', valeur: Math.max(1, Math.round(minutes)) };
  }
  const heures = Math.round(minutes / MINUTES_PAR_HEURE);
  if (heures < 24) return { unite: 'heures', valeur: heures };
  return { unite: 'jours', valeur: Math.max(1, Math.round(minutes / MINUTES_PAR_JOUR)) };
}

/** Deux lettres pour le monogramme d'un profil sans logo. */
export function initiales(nom: string): string {
  return nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');
}
