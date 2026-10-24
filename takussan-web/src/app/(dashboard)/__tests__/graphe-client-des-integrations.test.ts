import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { paquetsDuGrapheClient } from '@/test/graphe-client';

/**
 * TCK-1459 (P137.02) — l'écran des intégrations de l'agence valide son formulaire à la main
 * (`integrationFormSchema.safeParse`), sans `useForm`. Il chargeait pourtant react-hook-form, son
 * résolveur et le calendrier : `FormError` et `FormGlobalError` venaient du fichier `index.ts` de
 * `components/forms`, et `useTraducteurValidation` de `hooks/useApiForm.ts`, qui importe
 * react-hook-form et `@hookform/resolvers/zod`. Chacun vient désormais de son propre fichier.
 *
 * zod reste, par `lib/schemas/setting.ts` : le charger à l'envoi n'est pas l'objet de ce ticket.
 */
const PAGE = join(RACINE_SRC, 'app', '(dashboard)', 'app', 'agency', 'integrations', 'page.tsx');

describe('graphe client de /app/agency/integrations', () => {
  it('TCK-1459 — ni react-hook-form, ni son résolveur, ni sélecteur de date', () => {
    expect(
      paquetsDuGrapheClient(PAGE, ['react-hook-form', '@hookform/resolvers', 'react-day-picker', 'date-fns']),
    ).toEqual([]);
  });
});
