/**
 * Passe 3 (R2) — l'agence du bien, lue sur la ressource TELLE QU'ELLE EST RENDUE.
 * `PropertyResource` n'émet aucune clé `agency_id` : demander la colonne dans `fields[properties]`
 * ne la fait pas paraître, et la fiche lisait `property.agency_id` — `undefined`, puis `null` :
 * le bouton était masqué pour tout le personnel, sur tout bien. La route de détail émet le bloc
 * `agency` (`{id, name, …}`, `null` pour un bien sans agence) : c'est lui qu'on lit.
 *
 * Hors du module client de `PlanifierUneVisite` : la page qui l'appelle est un composant serveur, et
 * une fonction d'un module `'use client'` n'y est pas appelable (mesuré au navigateur : la fiche
 * tombait en « Something went wrong »).
 */
export function agenceDuBien(property: { readonly agency?: { readonly id: number } | null }): number | null {
  return property.agency?.id ?? null;
}
