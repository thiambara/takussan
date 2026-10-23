import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC, resoudreImport } from '@/test/analyse-statique';
import { modulesDuGrapheClient } from '@/test/graphe-client';

/**
 * TCK-1771 (P173.01) — le fichier `index.ts` de `components/console` réexportait quatre composants
 * `'use client'` (`DataTable`, `DebouncedSearchInput`, `FilterBar`, `Pagination`) : toute entrée
 * qui y prenait `RouteSkeleton` ou `PageHeader` — les 44 `loading.tsx` de `(dashboard)/app`, des
 * pages serveur de la console et du super-admin — faisait entrer ces composants, `ui/table` et
 * leurs dépendances dans son graphe client sans les afficher.
 *
 * Voie retenue parmi les deux de la piste (celle de TCK-1461) : l'`index.ts` ne réexporte plus
 * aucun module `'use client'`, et ces quatre composants se prennent à leur propre fichier.
 */
const APP = join(RACINE_SRC, 'app');
const INDEX = join(RACINE_SRC, 'components', 'console', 'index.ts');

function loadings(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : loadings(chemin);
    return nom === 'loading.tsx' ? [relative(APP, chemin)] : [];
  });
}

const LOADINGS = loadings(APP);

/**
 * Les squelettes de la console. Ceux du site public montent la barre de navigation (client) : eux
 * ne sont gardés que contre les composants client de la console.
 */
const LOADINGS_DE_LA_CONSOLE = LOADINGS.filter((e) => e.startsWith('(dashboard)/'));

const estClient = (fichier: string) => /^\s*['"]use client['"]/.test(readFileSync(fichier, 'utf8'));

/** Les pages serveur qui ne prennent à la console que `PageHeader` (mesuré, P173.01). */
const PAGES_SERVEUR = [
  '(dashboard)/app/overview/agent/page.tsx',
  '(dashboard)/app/overview/owner/page.tsx',
  '(dashboard)/app/overview/tenant/page.tsx',
  '(super-admin)/super-admin/system/page.tsx',
];

const CLIENT_DE_LA_CONSOLE = [
  'components/console/DataTable.tsx',
  'components/console/DebouncedSearchInput.tsx',
  'components/console/FilterBar.tsx',
  'components/console/Pagination.tsx',
];

describe('components/console/index.ts sans composant client', () => {
  it('TCK-1771 — l’index ne réexporte aucun module « use client »', () => {
    const reexportes = [...readFileSync(INDEX, 'utf8').matchAll(/^export (?!type)[^;]*from '([^']+)'/gm)].map(
      (m) => m[1]!,
    );
    expect(reexportes.length).toBeGreaterThan(0);
    const clients = reexportes.filter((spec) => {
      const cible = resoudreImport(spec, INDEX);
      return cible !== null && estClient(cible);
    });
    expect(clients).toEqual([]);
  });

  it('TCK-1771 — témoin : le balayage trouve les loading.tsx de src/app', () => {
    expect(LOADINGS).toContain('(dashboard)/app/commissions/loading.tsx');
    expect(LOADINGS_DE_LA_CONSOLE.length).toBeGreaterThanOrEqual(44);
  });

  it.each(LOADINGS_DE_LA_CONSOLE)('TCK-1771 — %s : aucun module client', (entree) => {
    expect([...modulesDuGrapheClient(join(APP, entree))]).toEqual([]);
  });

  it.each([...LOADINGS, ...PAGES_SERVEUR])(
    'TCK-1771 — %s : ni tableau, ni pagination, ni recherche de la console',
    (entree) => {
      const modules = modulesDuGrapheClient(join(APP, entree));
      expect(CLIENT_DE_LA_CONSOLE.filter((m) => modules.has(m))).toEqual([]);
    },
  );
});
