import type { Persona } from './personas';

/**
 * TCK-2480 (ADR-0089 §6) — les préférences du menu de `/app`, sur le COMPTE et par persona :
 * `preferences.navigation = { v: 1, personas: { <persona>: { epingles, replies, ouverts, demarrer_masque } } }`.
 *
 * L'API n'en valide que la forme (`UpdateMeRequest`) ; `preferences-schema.ts` la lit, et la fixture
 * `takussan-api/tests/fixtures/preferences-navigation.json` garde que les deux disent la même chose.
 * Une valeur illisible vaut la disposition par défaut : une préférence ne casse jamais le menu.
 *
 * - `epingles` : les destinations montées dans « Épinglés », dans l'ordre (cinq au plus) ;
 * - `replies` / `ouverts` : les ÉCARTS au repli par défaut des groupes de la disposition ;
 * - `demarrer_masque` : le groupe « Démarrer » (TCK-2479) a été fermé par l'utilisateur.
 */
export const EPINGLES_MAX = 5;
export const REPLIS_MAX = 20;

export interface PreferencesDuPersona {
  readonly epingles?: readonly string[];
  readonly replies?: readonly string[];
  readonly ouverts?: readonly string[];
  readonly demarrer_masque?: boolean;
}

export interface PreferencesDeNavigation {
  readonly v: 1;
  readonly personas: Readonly<Partial<Record<Persona, PreferencesDuPersona>>>;
}

export const NAVIGATION_VIDE: PreferencesDeNavigation = { v: 1, personas: {} };

export function prefsDe(navigation: PreferencesDeNavigation, persona: Persona): PreferencesDuPersona {
  return navigation.personas[persona] ?? {};
}

/** Les préférences sans ce qui vaut le défaut ; `undefined` quand rien ne s'en écarte. */
export function nettoyer(p: PreferencesDuPersona): PreferencesDuPersona | undefined {
  const sortie: {
    epingles?: readonly string[];
    replies?: readonly string[];
    ouverts?: readonly string[];
    demarrer_masque?: boolean;
  } = {};
  if (p.epingles?.length) sortie.epingles = p.epingles;
  if (p.replies?.length) sortie.replies = p.replies;
  if (p.ouverts?.length) sortie.ouverts = p.ouverts;
  if (p.demarrer_masque) sortie.demarrer_masque = true;
  return Object.keys(sortie).length > 0 ? sortie : undefined;
}

export function estParDefaut(p: PreferencesDuPersona): boolean {
  return nettoyer(p) === undefined;
}

/** La navigation où CE persona porte `p` — les autres intacts ; un persona revenu au défaut en sort. */
export function avecPersona(
  navigation: PreferencesDeNavigation,
  persona: Persona,
  p: PreferencesDuPersona,
): PreferencesDeNavigation {
  const personas: Partial<Record<Persona, PreferencesDuPersona>> = { ...navigation.personas };
  const propre = nettoyer(p);
  if (propre) personas[persona] = propre;
  else delete personas[persona];
  return { v: 1, personas };
}

/** Le corps de `PATCH /api/me` : `null` efface la clé quand plus aucun persona ne porte rien. */
export function versLeCorps(navigation: PreferencesDeNavigation): PreferencesDeNavigation | null {
  return Object.keys(navigation.personas).length > 0 ? navigation : null;
}

/**
 * Épingler ou désépingler `id`, en repartant des épingles RENDUES (arbitrage A7 : une épingle inconnue
 * ou devenue inaccessible, déjà invisible, est oubliée ici). À cinq, rien ne s'ajoute.
 */
export function epinglesApresBascule(rendues: readonly string[], id: string): string[] {
  if (rendues.includes(id)) return rendues.filter((e) => e !== id);
  if (rendues.length >= EPINGLES_MAX) return [...rendues];
  return [...rendues, id];
}

/**
 * Le geste d'épingle : `epingles` après bascule (`epinglesApresBascule`) et, quand une épingle
 * s'AJOUTE, « Épinglés » déplié s'il était replié — revue de TCK-2480 (M2) : l'utilisateur déplace
 * l'entrée, il doit voir où elle va. Une seule écriture porte les deux.
 */
export function prefsApresEpingle(p: PreferencesDuPersona, rendues: readonly string[], id: string): PreferencesDuPersona {
  const epingles = epinglesApresBascule(rendues, id);
  const ajoutee = epingles.length > rendues.length;
  return ajoutee ? { ...p, epingles, replies: (p.replies ?? []).filter((g) => g !== 'epingles') } : { ...p, epingles };
}

/** Replier (`replie`) ou ouvrir un groupe : seul l'écart au défaut de la disposition s'enregistre. */
export function prefsApresRepli(
  p: PreferencesDuPersona,
  groupe: string,
  replie: boolean,
  replieParDefaut: boolean,
): PreferencesDuPersona {
  const sauf = (liste?: readonly string[]) => (liste ?? []).filter((g) => g !== groupe);
  const replies = sauf(p.replies);
  const ouverts = sauf(p.ouverts);
  if (replie !== replieParDefaut) (replie ? replies : ouverts).push(groupe);
  return { ...p, replies: replies.slice(-REPLIS_MAX), ouverts: ouverts.slice(-REPLIS_MAX) };
}
