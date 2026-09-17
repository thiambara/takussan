import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TCK-532, vérification adverse (2026-09-16) — ce que les vues d'ensemble passent aux graphiques.
 *
 * Mesuré au navigateur : les `LineChart` affichaient les mois bruts de l'API (`2025-10`) dans
 * toutes les locales, et le pipeline de la vue agent tronquait ses étapes (en wolof, les six à
 * 320 px). Les deux correctifs vivent dans `components/charts` et sont testés là ; ce qui ne se
 * voit que dans les pages, c'est qu'elles les DEMANDENT. Composants serveur asynchrones qui lisent
 * l'API : le test lit la source, comme `kpi-grilles.tck-505.test.ts`.
 */
const source = (vue: string) => readFileSync(join(__dirname, '..', vue, 'page.tsx'), 'utf8');

describe('vues d’ensemble — options des graphiques (TCK-532)', () => {
  it.each(['agency', 'owner', 'agent'])('overview/%s : chaque LineChart formate ses mois', (vue) => {
    const graphiques = source(vue).match(/<LineChart\b[^>]*?>/g) ?? [];
    expect(graphiques.length).toBeGreaterThan(0);
    for (const g of graphiques) expect(g).toContain('abscisses="mois"');
  });

  it('overview/agent : le pipeline est en barres horizontales', () => {
    const graphiques = source('agent').match(/<BarChart\b[^>]*?>/g) ?? [];
    expect(graphiques).toHaveLength(1);
    expect(graphiques[0]).toContain('orientation="horizontal"');
  });
});
