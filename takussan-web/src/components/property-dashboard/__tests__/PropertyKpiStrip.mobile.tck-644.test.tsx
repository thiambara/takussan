import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { PropertyKpiStrip } from '../PropertyKpiStrip';

/**
 * TCK-644 — relevé du porteur à 390 px : quatre grandes tuiles en grille 2×2 prenaient la moitié du
 * premier écran. Sous `lg`, les compteurs deviennent UNE rangée de pastilles qui défile de côté
 * (dans son conteneur, jamais le document — TCK-505) ; ce sont toujours des liens qui filtrent la
 * liste. Dès `lg`, la grille de quatre tuiles d'origine revient.
 */
const TUILES = [
  { label: 'Total', value: 12, href: '/app/properties', active: true },
  { label: 'Publiés', value: 7, href: '/app/properties?visibility=public' },
  { label: 'Vendus / Loués', value: 1200, href: '/app/properties?status=sold' },
  { label: 'Archivés', value: 0, href: '/app/properties?include_archived=1&status=archived' },
];

const classes = (el: Element) => el.className.split(/\s+/);

describe('<PropertyKpiStrip> sous lg — une rangée de pastilles (TCK-644)', () => {
  it('pose une rangée qui défile dans son conteneur, et la grille dès lg', () => {
    render(<PropertyKpiStrip tiles={TUILES} />);
    const rangee = screen.getByRole('navigation');
    expect(classes(rangee)).toEqual(
      expect.arrayContaining(['flex', 'overflow-x-auto', 'lg:grid', 'lg:grid-cols-4']),
    );
    expect(classes(rangee)).not.toContain('grid-cols-2');
  });

  it('chaque compteur reste un lien qui filtre, compact sous lg et en tuile dès lg', () => {
    render(<PropertyKpiStrip tiles={TUILES} />);
    const lien = screen.getByRole('link', { name: /Vendus \/ Loués/ });
    expect(lien).toHaveAttribute('href', '/app/properties?status=sold');
    expect(classes(lien)).toEqual(expect.arrayContaining(['shrink-0', 'rounded-full', 'lg:rounded-xl']));
    const valeur = within(lien).getByText((_, el) => el?.textContent === (1200).toLocaleString('fr-FR'));
    expect(classes(valeur)).toContain('lg:text-2xl');
    expect(classes(valeur)).not.toContain('text-2xl');
  });

  it('le compteur actif se lit sans couleur seule : aria-current et pastille pleine', () => {
    render(<PropertyKpiStrip tiles={TUILES} />);
    const actif = screen.getByRole('link', { name: /Total/ });
    expect(actif).toHaveAttribute('aria-current', 'true');
    expect(classes(actif)).toContain('bg-foreground');
    const inactif = screen.getByRole('link', { name: /Publiés/ });
    expect(inactif).not.toHaveAttribute('aria-current');
    expect(classes(inactif)).not.toContain('bg-foreground');
  });
});
