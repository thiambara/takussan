import { z } from 'zod';
import { PERSONAS } from './personas';
import { EPINGLES_MAX, NAVIGATION_VIDE, REPLIS_MAX, type PreferencesDeNavigation } from './preferences';

/**
 * TCK-2480 (ADR-0089 §6) — le schéma de `preferences.navigation`, À PART des fonctions pures de
 * `preferences.ts` : zod n'entre sur une page publique que par un formulaire (TCK-744,
 * `zod-hors-des-pages-publiques.test.ts`), et la barre d'onglets publique (TCK-2493) compose le menu
 * par `useMenuDeLEspace`, qui lit `prefsDe`. Seul le fournisseur de `/app` (`PreferencesDuMenu.tsx`)
 * lit la valeur rendue par l'API.
 */
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

