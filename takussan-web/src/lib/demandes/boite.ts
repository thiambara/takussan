/**
 * TCK-2584 — les règles pures de la boîte « Demandes » : l'âge d'une demande (rouge au-delà de
 * 24 h), la borne du compte « depuis plus de 24 h », le prénom du demandeur. Sans horloge : l'instant
 * est donné par l'appelant, ce qui rend la règle testable et la mesure reproductible.
 */

/** Une demande à traiter depuis plus de 24 h est EN RETARD : point et âge en rouge. */
export const DELAI_DE_RETARD_MS = 24 * 60 * 60 * 1000;

const JOUR_MS = 24 * 60 * 60 * 1000;

export type UniteDAge = 'instant' | 'minutes' | 'heures' | 'jours';

export interface AgeDeLaDemande {
  readonly unite: UniteDAge;
  /** Le nombre entier de l'unité (0 pour `instant`). */
  readonly valeur: number;
  /** Plus de 24 h. */
  readonly enRetard: boolean;
}

/**
 * L'âge relatif : « à l'instant » sous la minute, puis en minutes sous l'heure, en heures sous les
 * 24 h — arrondis vers le bas. Au-delà, en JOURS DU CALENDRIER de Dakar (UTC, sans heure d'été) :
 * reçue le 2 novembre à 17:47, une demande a « 8 j » le 10 à midi (`app-demandes` a-0), et non les
 * 7 j que donneraient ses 7 j 18 h. Une date illisible ou dans le futur (horloge du poste en retard)
 * vaut « à l'instant ».
 */
export function ageDeLaDemande(creeLe: string, maintenant: Date): AgeDeLaDemande {
  const ecart = maintenant.getTime() - new Date(creeLe).getTime();
  if (!Number.isFinite(ecart) || ecart < 60_000) return { unite: 'instant', valeur: 0, enRetard: false };
  const enRetard = ecart > DELAI_DE_RETARD_MS;
  const minutes = Math.floor(ecart / 60_000);
  if (minutes < 60) return { unite: 'minutes', valeur: minutes, enRetard };
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return { unite: 'heures', valeur: heures, enRetard };
  const jour = (d: Date) => Math.floor(d.getTime() / JOUR_MS);
  return { unite: 'jours', valeur: Math.max(1, jour(maintenant) - jour(new Date(creeLe))), enRetard };
}

/**
 * La borne haute de `filter[created_at_max]` pour « depuis plus de 24 h » : l'instant moins 24 h,
 * arrondi à la minute (la clé de la requête ne change pas à chaque rendu), en UTC et au format
 * `AAAA-MM-JJ HH:MM:00`. Avec ses `:`, l'API la lit comme un instant, pas comme un jour entier
 * (`RangeFilter`).
 */
export function borneDuRetard(maintenant: Date): string {
  const borne = new Date(Math.floor((maintenant.getTime() - DELAI_DE_RETARD_MS) / 60_000) * 60_000);
  return `${borne.toISOString().slice(0, 16).replace('T', ' ')}:00`;
}

/** Le prénom d'un demandeur : le premier mot de son nom, ou `null`. */
export function prenomDuDemandeur(nom: string | null | undefined): string | null {
  const premier = nom?.trim().split(/\s+/)[0];
  return premier ? premier : null;
}
