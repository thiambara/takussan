import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

import SuperAdminSystemPage from '../system/page';

const SRC = join(process.cwd(), 'src');

/**
 * Retire commentaires de bloc et de ligne — sans quoi le docblock de `system/page.tsx`, qui
 * RACONTE qu'il ne monte plus la grille, compterait comme un montage. Un test qui atteste de la
 * prose n'atteste de rien (même geste que `scripts/check-feedback-states.mjs`).
 */
function sansCommentaires(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function fichiersSource(dir: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dir)) {
    const chemin = join(dir, entree);
    if (statSync(chemin).isDirectory()) {
      if (entree === '__tests__' || entree === 'node_modules') continue;
      fichiersSource(chemin, acc);
    } else if (/\.tsx?$/.test(entree)) {
      acc.push(chemin);
    }
  }
  return acc;
}

describe('AC2 — la grille de huit tuiles n’a plus qu’un seul point de montage', () => {
  /**
   * Ce test ne regarde PAS un écran : il regarde le graphe d'imports, parce que c'est là que le
   * doublon vivait. `/super-admin` et `/super-admin/system` rendaient tous deux
   * `<SystemMetricsGrid />` — deux pages qui affichent la même chose sont une page. Une assertion
   * de rendu sur une seule des deux n'aurait rien attrapé : chacune, prise seule, était correcte.
   */
  it('un seul fichier monte <SystemMetricsGrid />', () => {
    const monteurs = fichiersSource(SRC)
      .filter((chemin) => !chemin.endsWith('SystemMetricsGrid.tsx'))
      .filter((chemin) => /<SystemMetricsGrid\b/.test(sansCommentaires(readFileSync(chemin, 'utf8'))));

    expect(monteurs.map((c) => c.slice(SRC.length + 1))).toEqual([
      join('app', '(super-admin)', 'super-admin', 'page.tsx'),
    ]);
  });
});

describe('/super-admin/system est devenu un index (TCK-360)', () => {
  it('rend les quatre destinations et plus aucune grille de métriques', async () => {
    render(await SuperAdminSystemPage());

    const attendus = [
      '/super-admin/system/health',
      '/super-admin/system/maintenance',
      '/super-admin/system/scheduler',
      '/super-admin/settings',
    ];
    const liens = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    expect(liens).toEqual(attendus);
    expect(screen.queryByTestId('system-metrics-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('system-metrics-loading')).not.toBeInTheDocument();
  });
});
