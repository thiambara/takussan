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
  it('rend toutes les destinations du groupe « Système » et plus aucune grille de métriques', async () => {
    render(await SuperAdminSystemPage());

    // TCK-365 — `/super-admin/system/jobs` s'ajoute ici, et pas par confort de symétrie : ce hub
    // listait TROIS écrans techniques pendant que le groupe « Système » de la barre latérale en
    // portait QUATRE. Cette liste-là était verte en défendant la porte manquante.
    const attendus = [
      '/super-admin/system/health',
      '/super-admin/system/jobs',
      '/super-admin/system/maintenance',
      '/super-admin/system/scheduler',
      '/super-admin/settings',
    ];
    const liens = [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href'));
    expect(liens).toEqual(attendus);
    expect(screen.queryByTestId('system-metrics-grid')).not.toBeInTheDocument();
    expect(screen.queryByTestId('system-metrics-loading')).not.toBeInTheDocument();
  });

  /**
   * D8 — l'entrée neuve doit porter un LIBELLÉ, pas une clé i18n brute.
   *
   * Elle n'a pas d'entrée dans `pages.system.entries` : elle emprunte le titre et le sous-titre de
   * sa propre page. Un chemin de clé qui n'existe pas ne casse rien — `mockTraductionsServeur`
   * rend la clé, exactement comme next-intl en production. C'est donc à l'écran qu'il faut le
   * voir, et nulle part ailleurs.
   */
  it('nomme l’entrée « jobs échoués » sans laisser fuir une clé i18n', async () => {
    render(await SuperAdminSystemPage());

    const lien = [...document.querySelectorAll('a[href]')]
      .find((a) => a.getAttribute('href') === '/super-admin/system/jobs');

    expect(lien).toBeDefined();
    expect(lien).toHaveTextContent('Jobs échoués');
    expect(lien?.textContent ?? '').not.toMatch(/superAdmin\.|pages\./);
  });
});
