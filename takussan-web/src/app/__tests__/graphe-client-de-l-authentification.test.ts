import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { modulesDuGrapheClient, paquetsDuGrapheClient } from '@/test/graphe-client';

/**
 * Le graphe client des pages d'authentification (angle 137 du fichier de pistes).
 *
 * TCK-1457 (P137.01) — `verify-email`, `reset-password` et le retour OAuth (qui monte
 * `DefiSecondFacteur`) prenaient `FormError` et `FormGlobalError` au fichier `index.ts` de
 * `components/forms`, qui réexporte aussi les champs liés à react-hook-form et les sélecteurs de
 * date. Aucune de ces trois pages n'a de champ react-hook-form ni de date : elles prennent ces deux
 * composants à `@/components/forms/FormError`.
 *
 * TCK-1463 (P137.04) — connexion et inscription prenaient `loginSchema` et `registerSchema` au
 * fichier `index.ts` de `lib/schemas`, qui réexporte onze modules (bien, bail, état des lieux,
 * paiement…). Elles les prennent à `@/lib/schemas/auth`.
 *
 * TCK-1465 (P137.05) — la garde générale, du patron de TCK-1200 : les pages et layouts de `(auth)`
 * sont TROUVÉS, pas énumérés. Aucun n'atteint le calendrier ; aucun n'atteint react-hook-form, son
 * résolveur ni zod, sauf ceux qui affichent un formulaire react-hook-form dès le chargement, déclarés
 * dans {@link FORMULAIRES_AU_CHARGEMENT} avec leur raison.
 */
const AUTH = join(RACINE_SRC, 'app', '(auth)');

/** Les pages de `(auth)` qui montent un formulaire react-hook-form (validé par zod) au chargement. */
const FORMULAIRES_AU_CHARGEMENT: readonly string[] = [
  // `useApiForm` + `loginSchema` : le formulaire de connexion est la page.
  'auth/login/page.tsx',
  // `useApiForm` + `registerSchema` : le formulaire d'inscription est la page.
  'auth/register/page.tsx',
];

function entrees(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : entrees(chemin);
    return nom === 'page.tsx' || nom === 'layout.tsx' ? [relative(AUTH, chemin)] : [];
  });
}

const ENTREES = entrees(AUTH);

const FORMULAIRES_ET_DATES = ['react-hook-form', '@hookform/resolvers', 'react-day-picker', 'date-fns'];

describe('graphe client des pages d’authentification', () => {
  it.each(['auth/verify-email/page.tsx', 'auth/reset-password/page.tsx', 'auth/oauth/[provider]/callback/page.tsx'])(
    'TCK-1457 — %s : ni react-hook-form ni sélecteur de date',
    (page) => {
      expect(paquetsDuGrapheClient(join(AUTH, page), FORMULAIRES_ET_DATES)).toEqual([]);
    },
  );

  it.each(['auth/login/page.tsx', 'auth/register/page.tsx'])(
    'TCK-1463 — %s : seuls les schémas d’authentification',
    (page) => {
      const schemas = [...modulesDuGrapheClient(join(AUTH, page))].filter((m) => m.startsWith('lib/schemas/')).sort();
      expect(schemas).toEqual(['lib/schemas/auth.ts', 'lib/schemas/common.ts', 'lib/schemas/messages.ts']);
    },
  );

  it('TCK-1465 — témoin : le balayage trouve les pages et layouts de (auth)', () => {
    expect(ENTREES).toContain('layout.tsx');
    expect(ENTREES).toContain('auth/verify-email/page.tsx');
    expect(ENTREES.length).toBeGreaterThanOrEqual(13);
    for (const declaree of FORMULAIRES_AU_CHARGEMENT) expect(ENTREES).toContain(declaree);
  });

  it.each(ENTREES)('TCK-1465 — %s : aucun chemin vers le calendrier', (entree) => {
    expect(paquetsDuGrapheClient(join(AUTH, entree), ['react-day-picker', 'date-fns'])).toEqual([]);
  });

  it.each(ENTREES.filter((e) => !FORMULAIRES_AU_CHARGEMENT.includes(e)))(
    'TCK-1465 — %s : aucun chemin vers react-hook-form ni zod',
    (entree) => {
      expect(paquetsDuGrapheClient(join(AUTH, entree), ['react-hook-form', '@hookform/resolvers', 'zod'])).toEqual([]);
    },
  );
});
