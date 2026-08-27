import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WarningBanner } from '@/components/ui/warning-banner';

describe('WarningBanner', () => {
  it("ne pose AUCUN rôle par défaut — un avis statique n'est pas une région live", () => {
    const { container } = render(<WarningBanner>Ces réglages sont sensibles.</WarningBanner>);

    // Le contraire de `DestructiveBanner`, et c'est le point non évident : les deux appelants
    // (`/enums`, `/settings`) rendent l'avis au premier peint. Une région live n'annonce rien à
    // ce moment-là et se redéclencherait à chaque re-rendu.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.firstChild).toHaveTextContent('Ces réglages sont sensibles.');
  });

  it('accepte un rôle explicite quand l\'avertissement APPARAÎT en réaction à une action', () => {
    render(<WarningBanner role="status">Codes de récupération</WarningBanner>);

    expect(screen.getByRole('status')).toHaveTextContent('Codes de récupération');
  });

  it('ne décide aucune couleur en dur — il ne cite que le jeton --warning', () => {
    const { container } = render(<WarningBanner>Avis</WarningBanner>);
    const classes = (container.firstChild as HTMLElement).className;

    // Le bandeau existe PARCE QUE `bg-amber-50 / text-amber-950 / ring-amber-200` était recopié
    // à l'identique dans deux écrans. Ce test échoue si la palette brute y revient.
    expect(classes).toMatch(/bg-warning\/10/);
    expect(classes).toMatch(/text-warning/);
    expect(classes).toMatch(/ring-warning\/20/);
    expect(classes).not.toMatch(/amber|stone|yellow/);
  });

  it('rend l\'icône avant le contenu, et rien du tout sans icône', () => {
    const { container, rerender } = render(<WarningBanner>Avis</WarningBanner>);
    expect(container.querySelectorAll('svg')).toHaveLength(0);

    rerender(
      <WarningBanner icon={<svg data-testid="icone" />}>Avis</WarningBanner>,
    );
    expect(screen.getByTestId('icone')).toBeInTheDocument();
  });
});
