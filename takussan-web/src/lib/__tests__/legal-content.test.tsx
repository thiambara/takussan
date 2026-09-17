/**
 * TCK-531 — la règle d'affichage des textes juridiques (`docs/features.md` §2.10), et le rendu
 * qui les met en page. Aucun texte réel ici : les sources sont des chaînes de test.
 */
import React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { analyserTexteJuridique, TexteJuridique } from '@/components/legal/TexteJuridique';
import { contenuLegal, type SourcesLegales } from '@/lib/legal-content';

const vide = { fr: '', en: '', wo: '' };

function sources(terms: { fr: string; en: string; wo: string }): SourcesLegales {
  return { terms, privacy: vide, notice: vide };
}

describe('contenuLegal', () => {
  it('rend « à fournir » dans les trois langues tant que le français manque — même avec une traduction', () => {
    const s = sources({ fr: '  \n ', en: 'EN', wo: 'WO' });
    for (const locale of ['fr', 'en', 'wo'] as const) {
      expect(contenuLegal('terms', locale, s)).toEqual({ etat: 'a-fournir' });
    }
  });

  it('rend le français sans mention en français', () => {
    expect(contenuLegal('terms', 'fr', sources({ fr: 'FR', en: 'EN', wo: '' }))).toEqual({
      etat: 'publie', texte: 'FR', langue: 'fr', mention: null,
    });
  });

  it('rend la traduction avec sa mention, ou le français quand elle manque', () => {
    const s = sources({ fr: 'FR', en: 'EN', wo: '' });
    expect(contenuLegal('terms', 'en', s)).toEqual({
      etat: 'publie', texte: 'EN', langue: 'en', mention: 'traduction',
    });
    expect(contenuLegal('terms', 'wo', s)).toEqual({
      etat: 'publie', texte: 'FR', langue: 'fr', mention: 'francais-seul',
    });
  });

  it('lit les vraies sources sans lever', () => {
    // Forme seulement : le contenu réel est gardé par `src/content/legal/__tests__/textes.test.ts`.
    for (const document of ['terms', 'privacy', 'notice'] as const) {
      expect(['a-fournir', 'publie']).toContain(contenuLegal(document, 'fr').etat);
    }
  });
});

describe('TexteJuridique', () => {
  it('analyse titres, paragraphes joints et listes', () => {
    const blocs = analyserTexteJuridique(
      '# Titre\n\nligne un\nligne deux\n\n- a\n- b\n1. x\n2. y\nsuite de y\n\n### Sous',
    );
    expect(blocs).toEqual([
      { type: 'titre', niveau: 1, texte: 'Titre' },
      { type: 'paragraphe', texte: 'ligne un ligne deux' },
      { type: 'liste', ordonnee: false, items: ['a', 'b'] },
      { type: 'liste', ordonnee: true, items: ['x', 'y suite de y'] },
      { type: 'titre', niveau: 3, texte: 'Sous' },
    ]);
  });

  it('n’interprète aucun HTML et rend le gras', () => {
    const { container } = render(
      <TexteJuridique source={'# A\n\nun **fort** <img src=x onerror=alert(1)>'} />,
    );
    expect(container.querySelector('h2')?.textContent).toBe('A');
    expect(container.querySelector('strong')?.textContent).toBe('fort');
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('neutralise script et liens `javascript:` — ni balise, ni lien, ni attribut créés', () => {
    const source =
      '<script>alert(1)</script>\n\n'
      + '[clic](javascript:alert(1)) <a href="javascript:alert(2)">a</a>\n\n'
      + '- **<iframe src="javascript:alert(3)">**';
    const { container } = render(<TexteJuridique source={source} />);
    expect(container.querySelector('script, a, iframe, [href], [src]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/<(script|a|iframe)[\s>]/);
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(container.textContent).toContain('[clic](javascript:alert(1))');
    expect(container.querySelector('strong')?.textContent).toBe('<iframe src="javascript:alert(3)">');
  });
});
