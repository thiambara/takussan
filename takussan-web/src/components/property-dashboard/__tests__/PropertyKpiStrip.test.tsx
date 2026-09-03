import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PropertyKpiStrip } from '../PropertyKpiStrip';

/**
 * TCK-505, défaut #9 — quatre colonnes dès `md` dans la coque `/app` (barre latérale 256 px) :
 * tuiles à ~120 px à 768, libellés sur trois lignes. Les colonnes se posent dès `lg`.
 * L'ablation : `md:grid-cols-4 lg:grid-cols-4` rougit l'assertion d'absence.
 */
describe('<PropertyKpiStrip> — quatre colonnes dès lg, pas dès md (TCK-505 #9)', () => {
  it('la bande passe à quatre colonnes à lg seulement', () => {
    render(<PropertyKpiStrip tiles={[{ label: 'Biens publiés', value: 3, href: '/app/properties' }]} />);
    const grille = screen.getByText('Biens publiés').closest('[class*="grid-cols-"]') as HTMLElement;
    const classes = grille.className.split(/\s+/);
    expect(classes).toContain('lg:grid-cols-4');
    expect(classes).not.toContain('md:grid-cols-4');
  });
});
