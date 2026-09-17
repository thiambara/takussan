/**
 * TCK-531 — les textes juridiques RÉELS : publiés, rendables par `TexteJuridique`, et parallèles
 * d'une langue à l'autre.
 *
 * Ce test ne juge pas le fond (c'est l'affaire d'un juriste). Il garde ce qu'une relecture ne voit
 * pas : une interpolation qui rend `undefined`, une syntaxe que le rendu réduit ne sait pas
 * afficher (liste imbriquée, tableau, lien), une traduction qui a perdu un article.
 */
import { describe, expect, it } from 'vitest';

import { analyserTexteJuridique } from '@/components/legal/TexteJuridique';
import { contenuLegal } from '@/lib/legal-content';
import { DOCUMENTS_LEGAUX } from '@/lib/legal-routes';
import { A_COMPLETER } from '@/content/legal/editeur';
import * as notice from '@/content/legal/notice';
import * as privacy from '@/content/legal/privacy';
import * as terms from '@/content/legal/terms';

const SOURCES = { terms, privacy, notice } as const;

/** Tout crochet qui annonce une valeur à compléter, quelle qu'en soit la graphie. */
const MARQUEUR = /\[[^\]]*compl[ée]ter[^\]]*\]/gi;

/** Les titres de premier niveau — les articles — d'un texte. */
function articles(texte: string): number {
  return analyserTexteJuridique(texte).filter((b) => b.type === 'titre' && b.niveau === 1).length;
}

describe.each(DOCUMENTS_LEGAUX)('texte juridique « %s »', (document) => {
  const { fr, en } = SOURCES[document];

  it('est publié en français, traduit en anglais, et retombe sur le français en wolof', () => {
    expect(contenuLegal(document, 'fr')).toMatchObject({ etat: 'publie', langue: 'fr', mention: null });
    expect(contenuLegal(document, 'en')).toMatchObject({ etat: 'publie', langue: 'en', mention: 'traduction' });
    expect(contenuLegal(document, 'wo')).toMatchObject({ etat: 'publie', langue: 'fr', mention: 'francais-seul' });
  });

  it.each([
    ['fr', fr],
    ['en', en],
  ])('ne porte aucune interpolation ratée ni syntaxe que le rendu ne sait pas afficher (%s)', (_l, texte) => {
    expect(texte).not.toMatch(/undefined|\[object |\$\{/);
    // Le rendu aplatit une liste indentée et affiche tels quels tableaux, liens et titres de niveau 4.
    expect(texte).not.toMatch(/^[ \t]+[-*]\s/m);
    expect(texte).not.toMatch(/^[ \t]*\|/m);
    expect(texte).not.toMatch(/\]\(|^#{4,}/m);
    // Un texte à compléter ne l'est que par les marqueurs d'`editeur.ts`, jamais par un TODO libre.
    expect(texte).not.toMatch(/\b(TODO|TBD|XXX|FIXME)\b/);
    const marqueurs = texte.match(MARQUEUR) ?? [];
    for (const m of marqueurs) expect(m.startsWith(`${A_COMPLETER} à compléter : `)).toBe(true);
  });

  it('reconnaît un marqueur « à compléter » — refus de vacuité du motif ci-dessus', () => {
    // Sur une chaîne de synthèse : les vrais textes perdront leurs marqueurs quand le porteur les
    // remplira, et ce jour-là ne doit rougir aucune suite.
    expect(`x ${A_COMPLETER} à compléter : RCCM] y`.match(MARQUEUR)).toHaveLength(1);
    expect('[À COMPLETER RCCM]'.match(MARQUEUR)).toHaveLength(1);
  });

  it('a autant d’articles en anglais qu’en français', () => {
    expect(articles(fr)).toBeGreaterThan(0);
    expect(articles(en)).toBe(articles(fr));
  });
});
