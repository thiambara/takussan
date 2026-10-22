import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { paquetsDuGrapheClient } from '@/test/graphe-client';

/**
 * Le graphe client des pages d'authentification (angle 137 du fichier de pistes).
 *
 * TCK-1457 (P137.01) — `verify-email`, `reset-password` et le retour OAuth (qui monte
 * `DefiSecondFacteur`) prenaient `FormError` et `FormGlobalError` au fichier `index.ts` de
 * `components/forms`, qui réexporte aussi les champs liés à react-hook-form et les sélecteurs de
 * date. Aucune de ces trois pages n'a de champ react-hook-form ni de date : elles prennent ces deux
 * composants à `@/components/forms/FormError`.
 */
const AUTH = join(RACINE_SRC, 'app', '(auth)');

const FORMULAIRES_ET_DATES = ['react-hook-form', '@hookform/resolvers', 'react-day-picker', 'date-fns'];

describe('graphe client des pages d’authentification', () => {
  it.each(['auth/verify-email/page.tsx', 'auth/reset-password/page.tsx', 'auth/oauth/[provider]/callback/page.tsx'])(
    'TCK-1457 — %s : ni react-hook-form ni sélecteur de date',
    (page) => {
      expect(paquetsDuGrapheClient(join(AUTH, page), FORMULAIRES_ET_DATES)).toEqual([]);
    },
  );
});
