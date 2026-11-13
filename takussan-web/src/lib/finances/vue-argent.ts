import { bornesDuMois, estMois } from './mois';

/**
 * TCK-2659 — ce que l'adresse de « Argent » (`/app/agency/finances`) ouvre.
 *
 * - **Le point du mois** (maquette « Tableau du mois ») : l'adresse nue, ou avec le seul `?period=`.
 * - **Un registre** (maquette « Encaissements ») : `?tab=` nomme l'un des six. Au téléphone, c'est un
 *   écran de détail (flèche de retour vers le point du mois) ; au bureau, une page sous le fil
 *   « Argent › … », ses onglets sous l'en-tête.
 *
 * Un lien entrant qui ne porte que `entity_type` / `entity_id` (depuis un bail, un client) ouvre les
 * encaissements de cette entité : sans cette règle, il tomberait sur le point du mois, où rien ne
 * dit qu'un filtre est posé (« un lien entrant existant vers un onglet continue d'y mener »).
 */

/**
 * Les valeurs acceptées par `?tab=` — la table que `AdminFinancesTabs` réexporte (TCK-375 : le bloc
 * de files du tableau de bord d'agence renvoie vers `?tab=impayes`, l'invariant se vérifie contre
 * elle, jamais contre une chaîne recopiée).
 *
 * TCK-2677 — `interventions` : les factures des prestataires (TCK-594, ADR-0039 § 8), à valider puis
 * à payer, que l'onglet `bills` de `/app/payments` servait seul à l'admin d'agence.
 */
export const TAB_VALUES = ['encaissements', 'factures', 'reversements', 'a-approuver', 'interventions', 'impayes'] as const;
export type OngletArgent = (typeof TAB_VALUES)[number];

export function estOngletArgent(valeur: string | null | undefined): valeur is OngletArgent {
  return !!valeur && (TAB_VALUES as readonly string[]).includes(valeur);
}

/** Lecture seule de l'adresse : `URLSearchParams` ou ce que rend `useSearchParams()`. */
interface ParametresLus {
  get(nom: string): string | null;
}

export type VueArgent = { readonly sorte: 'point' } | { readonly sorte: 'registre'; readonly onglet: OngletArgent };

export function vueDeLArgent(params: ParametresLus): VueArgent {
  const tab = params.get('tab');
  if (estOngletArgent(tab)) return { sorte: 'registre', onglet: tab };
  if (params.get('entity_type') && params.get('entity_id')) return { sorte: 'registre', onglet: 'encaissements' };
  return { sorte: 'point' };
}

/** Le mois que la page montre : `?period=` s'il est valide, sinon le mois en cours. */
export function moisAffiche(params: ParametresLus, courant: string): string {
  const periode = params.get('period');
  return estMois(periode) ? periode : courant;
}

/**
 * Les bornes des encaissements, dans cet ordre de préséance :
 *
 * 1. `date_from` / `date_to` explicites (un lien entrant, le filtre « Du / Au ») ;
 * 2. le mois choisi (`?period=`) ;
 * 3. une entité désignée sans mois : TOUS ses paiements — le lien d'un bail veut son historique,
 *    pas son seul mois en cours ;
 * 4. le mois en cours.
 *
 * `mois` est `null` quand les bornes ne sont pas celles d'un mois : le sélecteur le dit.
 */
export function bornesDesEncaissements(
  params: ParametresLus,
  courant: string,
): { readonly du?: string; readonly au?: string; readonly mois: string | null } {
  const du = params.get('date_from') || undefined;
  const au = params.get('date_to') || undefined;
  if (du || au) return { du, au, mois: null };
  const periode = params.get('period');
  if (estMois(periode)) return { ...bornesDuMois(periode), mois: periode };
  if (params.get('entity_type') && params.get('entity_id')) return { mois: null };
  return { ...bornesDuMois(courant), mois: courant };
}

/**
 * Le libellé de bornes « Du / Au » posées — « 1 janv. – … », « 1 janv. – 31 mars » —, `null` sans borne.
 * Le même partout où la page nomme sa période : la pastille des dates, le sélecteur de mois (qui
 * disait « Toutes les dates » sous des bornes posées) et le résumé du téléphone (« Toutes dates »).
 */
export function libelleDesBornes(du: string | null | undefined, au: string | null | undefined, jourMois: (iso: string) => string): string | null {
  if (!du && !au) return null;
  return [du ? jourMois(`${du}T12:00:00Z`) : '…', au ? jourMois(`${au}T12:00:00Z`) : '…'].join(' – ');
}
