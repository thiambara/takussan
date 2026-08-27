import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AC2 de TCK-361 — **plus aucun attribut `title` ne porte de donnée dans `components/reporting/`.**
 *
 * Pourquoi une garde de FICHIER et non une assertion de rendu : `title` est le repli par défaut de
 * quiconque veut « afficher la valeur au survol ». Il est séduisant (une ligne) et cassé sur trois
 * axes à la fois — ni stylable, ni atteignable au clavier, ni affiché sur mobile. Un test de rendu
 * ne l'attraperait que sur le composant qu'il monte ; celui-ci couvre le répertoire entier, y
 * compris les composants qui n'existent pas encore.
 *
 * ⚠ La garde vise l'attribut JSX `title=`, pas le mot « title » : `params={{ title }}` ou une
 * propriété `title:` d'un objet restent légitimes.
 */

const RACINE = join(__dirname, '..');

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name);
    if (entree.isDirectory()) return entree.name === '__tests__' ? [] : fichiersTsx(chemin);
    return entree.name.endsWith('.tsx') ? [chemin] : [];
  });
}

describe('components/reporting — AC2 (TCK-361)', () => {
  it('ne porte aucun attribut `title` sur un élément de rendu', () => {
    const fautifs = fichiersTsx(RACINE).flatMap((chemin) =>
      readFileSync(chemin, 'utf8')
        .split('\n')
        .map((ligne, i) => ({ chemin, ligne: ligne.trim(), numero: i + 1 }))
        .filter(({ ligne }) => /(^|\s)title=[{"']/.test(ligne))
        .map(({ chemin, ligne, numero }) => `${chemin}:${numero} — ${ligne}`),
    );

    expect(fautifs).toEqual([]);
  });

  /** La garde doit pouvoir échouer : sans ce contrôle, un motif faux la rendrait verte à jamais. */
  it('reconnaît bien un attribut `title` (la garde sait échouer)', () => {
    const motif = /(^|\s)title=[{"']/;

    expect(motif.test('title={`${row.bucket}: ${row.count}`}')).toBe(true);
    expect(motif.test('<div title="42 %" />')).toBe(true);
    expect(motif.test('params={{ title }}')).toBe(false);
  });
});
