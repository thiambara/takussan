/**
 * TCK-2629 AC6 — un agent, même avec `reports.view_agency`, n'a pas l'onglet « Équipe » (garde : `ongletDeLaPersona`,
 * `lib/navigation/__tests__/rapports.tck-2628.test.ts`) ; et `team-performance` ne part pas de sa page.
 *
 * « Ne part pas » se juge sur ce que ses pages PEUVENT monter : le graphe d'imports de sa vue d'ensemble
 * (`EnsembleAgent`, la seule que `/app/reports` rend à l'agent), de ses onglets (commissions, pipeline,
 * exports) et de la coque de « Rapports » n'atteint aucun composant qui lit la performance de l'équipe
 * ou le délai de réponse de ses collègues. Les imports différés sont suivis.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { clotureDImport, nommer } from '@/test/analyse-statique';

const SRC = join(process.cwd(), 'src');
const LECTURES_DE_L_EQUIPE = /\buse(TeamPerformance|DelaisDeReponse)\s*\(/;
const PAGES_DE_L_AGENT = [
  'components/rapports/ensemble/EnsembleAgent.tsx',
  'app/(dashboard)/app/reports/layout.tsx',
  'app/(dashboard)/app/reports/commissions/page.tsx',
  'app/(dashboard)/app/reports/pipeline/page.tsx',
  'app/(dashboard)/app/reports/exports/page.tsx',
];

describe('TCK-2629 AC6 — la page de l’agent ne lit pas l’équipe', () => {
  it.each(PAGES_DE_L_AGENT)('%s : son graphe d’imports n’appelle ni useTeamPerformance ni useDelaisDeReponse', (entree) => {
    const graphe = clotureDImport([join(SRC, entree)]);
    expect(graphe.length).toBeGreaterThan(1);
    const lecteurs = graphe
      .filter((f) => !nommer(f).startsWith('lib/queries/'))
      .filter((f) => LECTURES_DE_L_EQUIPE.test(readFileSync(f, 'utf8')))
      .map(nommer);
    expect(lecteurs).toEqual([]);
  });

  it('le témoin : la vue de l’agence, elle, les atteint (la garde n’est pas vide)', () => {
    const graphe = clotureDImport([join(SRC, 'components/rapports/vues/OngletEquipe.tsx')]);
    const lecteurs = graphe.filter((f) => !nommer(f).startsWith('lib/queries/')).filter((f) => LECTURES_DE_L_EQUIPE.test(readFileSync(f, 'utf8')));
    expect(lecteurs.map(nommer)).toContain('components/rapports/equipe/EquipeDuRapport.tsx');
  });
});
