import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * TCK-595 (AC20 ter), porté de `overview/__tests__/locale.tck-595` quand les vues d'ensemble sont devenues
 * des onglets de « Rapports » (TCK-2628) : elles formatent dans la langue de la REQUÊTE. Les quatre anciennes
 * pages passaient `'fr'` (et `'fr-SN'` pour les heures de la vue agent) en dur : sous des libellés anglais, un
 * montant sortait `150 000 F CFA` et une date `1 juil. 2026`. Aucun fichier des vues ne fige plus une locale.
 */
const RACINE = join(__dirname, '..', '..');
const DOSSIERS = ['ensemble', 'graphiques', 'vues', '.'];

function fichiers(): string[] {
  return DOSSIERS.flatMap((d) =>
    readdirSync(join(RACINE, d))
      .filter((f) => /\.tsx?$/.test(f))
      .map((f) => join(d, f)),
  );
}

/** Retire les commentaires : un docblock peut citer `'fr'` sans rien figer. */
function code(fichier: string): string {
  return readFileSync(join(RACINE, fichier), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('aucune locale figée dans les vues de « Rapports »', () => {
  it('la liste n’est pas vide', () => {
    expect(fichiers()).toEqual(expect.arrayContaining([join('ensemble', 'EnsembleAgent.tsx'), join('ensemble', 'EnsembleBailleur.tsx')]));
  });

  it.each(fichiers())('%s ne passe ni « fr » ni « fr-SN »', (fichier) => {
    expect(code(fichier)).not.toMatch(/['"`]fr(?:-SN)?['"`]/);
  });
});
