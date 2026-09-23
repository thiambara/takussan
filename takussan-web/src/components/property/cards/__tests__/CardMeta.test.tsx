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
