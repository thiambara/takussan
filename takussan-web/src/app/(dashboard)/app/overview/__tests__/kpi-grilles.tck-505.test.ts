import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TCK-505, défaut #9 — les grilles de KPI des quatre vues d'ensemble se posaient en quatre
 * colonnes dès `md` (768), dans la coque `/app` dont la barre latérale prend 256 px : chaque
 * `StatCard` tombait à ~120 px et ses libellés sur trois à quatre lignes (mesuré le 2026-09-02).
 *
 * Ces pages sont des composants serveur asynchrones qui lisent l'API : le test lit la SOURCE,
 * ce qui est exactement ce que le correctif change. Il assert l'absence de `md:grid-cols-4`
 * (l'ablation : remettre l'ancienne classe à côté de la nouvelle rougit) et la présence de la
 * paire `sm:grid-cols-2 lg:grid-cols-4` sur CHAQUE grille — une page en porte deux.
 */
const PAGES = ['agency', 'owner', 'tenant', 'agent'] as const;

describe('vues d’ensemble — les KPI passent en quatre colonnes à lg, pas à md (TCK-505 #9)', () => {
  it.each(PAGES)('overview/%s/page.tsx', (vue) => {
    const source = readFileSync(join(__dirname, '..', vue, 'page.tsx'), 'utf8');
    const grilles = source.match(/className="[^"]*\bgrid\b[^"]*grid-cols-4[^"]*"/g) ?? [];

    expect(grilles.length).toBeGreaterThan(0);
    for (const grille of grilles) {
      expect(grille).not.toContain('md:grid-cols-4');
      expect(grille).toContain('sm:grid-cols-2');
      expect(grille).toContain('lg:grid-cols-4');
    }
  });
});
