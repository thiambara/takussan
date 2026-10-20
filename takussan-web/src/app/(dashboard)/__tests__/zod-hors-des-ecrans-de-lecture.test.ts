import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { paquetsDuGrapheClient } from '@/test/graphe-client';

/**
 * TCK-1038 (P70.01) — **un écran de lecture de la console ne charge pas zod.**
 *
 * Mesuré le 2026-10-20 (angle 70) : `/app/maintenance` et `/app/inventories` portaient zod
 * (morceau de 64,2 Kio gzip) et react-hook-form dans leur JS initial, pour 130 à 140 Kio de trop.
 * Ni `MaintenanceList` ni `InventoryList` n'y mènent : les pages les importaient par le fichier
 * `index.ts` de leur dossier, qui réexportait aussi les formulaires (`MaintenanceForm`,
 * `InventoryForm`…). Chaque page importe désormais chaque composant par son propre fichier.
 *
 * TCK-1039 (P70.02) : les listes des biens et des clients le chargeaient pour lire des tableaux
 * `as const` dans `@/lib/schemas/property` et `@/lib/schemas/customer`, deux modules qui commencent
 * par `import { z } from 'zod'`. Ces tableaux vivent dans `@/lib/enums/property` et
 * `@/lib/enums/customer`, sans dépendance (le patron de TCK-744).
 *
 * Les écrans ci-dessous n'affichent aucun formulaire au chargement : aucun chemin vers ces
 * paquets n'y est admis. Un écran de la console qui EST un formulaire (`new`) n'y figure pas.
 */
const PAQUETS = ['zod', 'react-hook-form', '@hookform/resolvers'];

const DASHBOARD = join(RACINE_SRC, 'app', '(dashboard)', 'app');

const ECRANS: readonly string[] = [
  'maintenance/(liste)/page.tsx',
  'inventories/(liste)/page.tsx',
  'inventories/[id]/page.tsx',
  // TCK-1039 (P70.02) — les listes de valeurs de bien et de client viennent de `@/lib/enums/*`.
  'properties/(liste)/page.tsx',
  'customers/(liste)/page.tsx',
];

describe('zod hors des écrans de lecture de la console', () => {
  it.each(ECRANS)('%s existe', (ecran) => {
    expect(existsSync(join(DASHBOARD, ecran))).toBe(true);
  });

  it.each(ECRANS)('%s : aucun chemin vers zod ni react-hook-form', (ecran) => {
    expect(paquetsDuGrapheClient(join(DASHBOARD, ecran), PAQUETS)).toEqual([]);
  });

  it.each(['maintenance', 'inventory'])(
    'components/%s n’a plus de fichier index.ts qui réexporte ses formulaires',
    (dossier) => {
      expect(existsSync(join(RACINE_SRC, 'components', dossier, 'index.ts'))).toBe(false);
    },
  );
});
