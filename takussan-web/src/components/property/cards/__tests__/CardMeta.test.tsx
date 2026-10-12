/**
 * `CardMeta` — un élément peut n'être montré qu'à certaines largeurs (TCK-555 : l'ancienneté et
 * l'état « Neuf » sont dans la ligne de détails sous `md`, sur la photo au-delà).
 *
 * Le séparateur ne se pose qu'ENTRE deux éléments présents (2026-09-16) ; il doit le rester à
 * chaque largeur : un élément masqué ne laisse ni puce en tête, ni puce en queue. On lit ici, par
 * les classes (jsdom ne charge aucune feuille de style), ce que chaque largeur affiche.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { CardMeta } from '../CardMeta';

/** Le texte affiché à une largeur : `md:hidden` disparaît au bureau, `hidden md:…` sur mobile. */
function affiche(racine: HTMLElement, largeur: 'mobile' | 'bureau'): string {
  return [...racine.children]
    .filter((el) => {
      const c = (el.getAttribute('class') ?? '').split(/\s+/);
      return largeur === 'bureau' ? !c.includes('md:hidden') : !c.includes('hidden');
    })
    .map((el) => el.textContent)
    .join(' ');
}

function monte(items: Parameters<typeof CardMeta>[0]['items']) {
  const { container } = render(<CardMeta items={items} />);
  return container.firstElementChild as HTMLElement;
}

describe('CardMeta — éléments propres à une largeur', () => {
  it('témoin : sans élément conditionnel, un séparateur entre deux éléments et nulle part ailleurs', () => {
    const ligne = monte(['3 ch', '95 m²', 'Maison']);
    expect(affiche(ligne, 'mobile')).toBe('3 ch • 95 m² • Maison');
    expect(affiche(ligne, 'bureau')).toBe('3 ch • 95 m² • Maison');
  });

  it('un élément de queue masqué au bureau emporte son séparateur', () => {
    const ligne = monte(['3 ch', '95 m²', { texte: 'il y a 3 mois', className: 'md:hidden' }]);
    expect(affiche(ligne, 'mobile')).toBe('3 ch • 95 m² • il y a 3 mois');
    expect(affiche(ligne, 'bureau')).toBe('3 ch • 95 m²');
  });

  it('un élément de TÊTE masqué au bureau ne laisse pas de puce en tête', () => {
    const ligne = monte([{ texte: 'Neuf', className: 'md:hidden' }, '3 ch', '95 m²']);
    expect(affiche(ligne, 'mobile')).toBe('Neuf • 3 ch • 95 m²');
    expect(affiche(ligne, 'bureau')).toBe('3 ch • 95 m²');
  });

  it('les deux à la fois', () => {
    const ligne = monte([
      { texte: 'Neuf', className: 'md:hidden' },
      '3 ch',
      { texte: 'il y a 3 mois', className: 'md:hidden' },
    ]);
    expect(affiche(ligne, 'mobile')).toBe('Neuf • 3 ch • il y a 3 mois');
    expect(affiche(ligne, 'bureau')).toBe('3 ch');
  });

  it('un élément conditionnel absent est écarté comme les autres', () => {
    const ligne = monte([null, '3 ch', false]);
    expect(affiche(ligne, 'mobile')).toBe('3 ch');
  });
});

// 2026-10-10 — sept cartes par rangée : la ligne de détails passait à la ligne sur une carte sur
// deux, et les prix ne s'alignaient plus. Les cartes des rangées la demandent sur une ligne.
describe('CardMeta — une seule ligne', () => {
  it('rogne au lieu de passer à la ligne, et garde le texte entier au survol', () => {
    const { container } = render(<CardMeta uneLigne items={['2 ch', '142 m²', 'il y a 2 mois']} />);
    const ligne = container.firstElementChild as HTMLElement;
    const classes = ligne.className.split(/\s+/);

    expect(classes).toContain('truncate');
    expect(classes).not.toContain('flex-wrap');
    expect(ligne).toHaveAttribute('title', '2 ch • 142 m² • il y a 2 mois');
    expect(ligne.textContent).toBe('2 ch•142 m²•il y a 2 mois');
  });

  it('par défaut, la ligne reste libre de passer à la ligne', () => {
    const { container } = render(<CardMeta items={['2 ch', '142 m²']} />);
    expect((container.firstElementChild as HTMLElement).className).toContain('flex-wrap');
  });
});
