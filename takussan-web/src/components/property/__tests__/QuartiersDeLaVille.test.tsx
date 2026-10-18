import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { QuartiersDeLaVille } from '@/components/property/QuartiersDeLaVille';
import { withIntl } from '@/test/intl';

/** TCK-916 (P35.02) — le bloc rend de vrais liens `<a href>`, préfixés de la langue. */
describe('QuartiersDeLaVille', () => {
  const liens = [
    { libelle: 'Mermoz', href: '/properties?city=Dakar&location=Mermoz' },
    { libelle: 'Ngor', href: '/properties?city=Dakar&location=Ngor' },
  ];

  it('une navigation titrée, un lien par quartier', () => {
    render(withIntl(<QuartiersDeLaVille ville="Dakar" liens={liens} />));

    const nav = screen.getByRole('navigation', { name: 'Quartiers de Dakar' });
    const ancres = within(nav).getAllByRole('link');
    expect(ancres.map((a) => a.getAttribute('href'))).toEqual([
      '/fr/properties?city=Dakar&location=Mermoz',
      '/fr/properties?city=Dakar&location=Ngor',
    ]);
    expect(ancres.map((a) => a.textContent)).toEqual(['Mermoz', 'Ngor']);
  });

  it('en anglais, le titre est traduit', () => {
    render(withIntl(<QuartiersDeLaVille ville="Dakar" liens={liens} />, 'en'));
    expect(screen.getByRole('navigation', { name: 'Neighbourhoods in Dakar' })).toBeTruthy();
  });

  it('AC2 — sans lien, rien n’est rendu', () => {
    const { container } = render(withIntl(<QuartiersDeLaVille ville="Dakar" liens={[]} />));
    expect(container.innerHTML).toBe('');
  });
});
