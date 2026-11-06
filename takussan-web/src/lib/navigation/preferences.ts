import { z } from 'zod';
import { PERSONAS, type Persona } from './personas';

/**
 * TCK-2480 (ADR-0089 §6) — les préférences du menu de `/app`, sur le COMPTE et par persona :
 * `preferences.navigation = { v: 1, personas: { <persona>: { epingles, replies, ouverts, demarrer_masque } } }`.
 *
 * L'API n'en valide que la forme (`UpdateMeRequest`) ; ce schéma la lit, et la fixture
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

const IDENTIFIANT = z.string().max(64).regex(/^[a-z0-9-]+$/);

/** PHP encode un tableau associatif vide en `[]` : un `{}` écrit revient de l'API sous cette forme. */
const VIDE_DE_PHP = z.array(z.never()).transform(() => ({}));

const SCHEMA_DU_PERSONA = z.union([
  z.strictObject({
    epingles: z.array(IDENTIFIANT).max(EPINGLES_MAX).optional(),
    replies: z.array(IDENTIFIANT).max(REPLIS_MAX).optional(),
    ouverts: z.array(IDENTIFIANT).max(REPLIS_MAX).optional(),
    demarrer_masque: z.boolean().optional(),
  }),
  VIDE_DE_PHP,
]);

export const SCHEMA_NAVIGATION = z.strictObject({
  v: z.literal(1),
  personas: z.union([z.partialRecord(z.enum(PERSONAS), SCHEMA_DU_PERSONA), VIDE_DE_PHP]),
});

/** `user.preferences?.navigation`, tel que l'API le rend : lu par le schéma, jamais cru. */
export function lirePreferencesDeNavigation(brut: unknown): PreferencesDeNavigation {
  const lu = SCHEMA_NAVIGATION.safeParse(brut);
  return lu.success ? lu.data : NAVIGATION_VIDE;
}

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
