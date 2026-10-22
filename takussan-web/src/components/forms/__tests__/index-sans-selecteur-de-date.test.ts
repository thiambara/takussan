import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { paquetsDuGrapheClient } from '@/test/graphe-client';

/**
 * TCK-1461 (P137.03) — le fichier `index.ts` de `components/forms` réexportait `FormDatePicker` et
 * `FormDateTimePicker` : toute page qui y prenait un champ, même sans afficher de date, chargeait
 * le calendrier (react-day-picker, date-fns). Ces deux champs se prennent désormais à leur propre
 * fichier, et l'`index.ts` ne les réexporte plus.
 *
 * Voie retenue parmi les deux de la piste : retirer les deux champs de l'`index.ts` (8 importeurs
 * à reprendre) plutôt que réécrire les 32 importeurs de l'`index.ts`.
 */
const APP = join(RACINE_SRC, 'app');

const PAGES_SANS_DATE = [
  '(auth)/auth/login/page.tsx',
  '(auth)/auth/register/page.tsx',
  '(dashboard)/app/agency/page.tsx',
  '(dashboard)/app/customers/new/page.tsx',
  '(dashboard)/app/maintenance/new/page.tsx',
  '(dashboard)/app/bookings/[id]/page.tsx',
];

describe('components/forms/index.ts sans sélecteur de date', () => {
  it('TCK-1461 — l’index ne réexporte ni FormDatePicker ni FormDateTimePicker', () => {
    const index = readFileSync(join(RACINE_SRC, 'components', 'forms', 'index.ts'), 'utf8');
    expect(index).not.toMatch(/from '\.\/FormDate(Time)?Picker'/);
  });

  it.each(PAGES_SANS_DATE)('TCK-1461 — %s : aucun chemin vers le calendrier', (page) => {
    expect(paquetsDuGrapheClient(join(APP, page), ['react-day-picker', 'date-fns'])).toEqual([]);
  });
});
