import {
  isFieldRelevant,
  relevanceContextOf,
} from '@/components/property-form/field-matrix';

/**
 * TCK-489 — ce qu'un lecteur doit savoir de la date de disponibilité d'un bien, et le seul
 * endroit où les quatre cas se distinguent.
 *
 * Quatre, pas deux : le champ peut être **absent** de la charge utile (`whenHas` côté
 * `PropertyResource` — la clé n'existe pas), **nul** (colonne jamais renseignée), **à venir**, ou
 * **déjà passée**. Les deux premiers ne rendent rien ; les deux derniers ne se disent pas de la
 * même manière — *une date passée n'est pas une attente*.
 *
 * ⚠ Le champ n'a de sens qu'en location : la condition est LUE dans `field-matrix.ts`, jamais
 * réécrite ici. C'est la même règle qui gouverne déjà sa saisie (TCK-464).
 */
export type Disponibilite =
  | { readonly etat: 'immediate' }
  | { readonly etat: 'datee'; readonly date: string };

export interface BienDisponible {
  readonly type: string | null | undefined;
  readonly contract_type?: string | null;
  readonly available_from?: string | null;
}

/**
 * Le jour courant au format calendaire, dans le fuseau de l'application.
 *
 * `Africa/Dakar` est à UTC+0 toute l'année (`TIMEZONE`, `src/i18n/config.ts`) : la partie date
 * d'un ISO en UTC EST le jour local. Pas d'`Intl` ici, donc pas de locale à figer — et la
 * comparaison reste littérale, comme partout ailleurs sur les dates calendaires (ADR-0018).
 */
function jourCourant(maintenant: Date): string {
  return maintenant.toISOString().slice(0, 10);
}

export function disponibiliteDe(
  bien: BienDisponible,
  maintenant: Date = new Date(),
): Disponibilite | null {
  if (!isFieldRelevant('available_from', relevanceContextOf(bien))) return null;

  const brut = bien.available_from;
  if (brut === null || brut === undefined || brut === '') return null;

  const jour = brut.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(jour)) return null;

  return jour <= jourCourant(maintenant) ? { etat: 'immediate' } : { etat: 'datee', date: jour };
}
