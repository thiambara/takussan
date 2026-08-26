import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatCard } from '@/components/console';

describe('<StatCard>', () => {
  it('rend le libellé, la valeur et l’indice', () => {
    render(<StatCard label="File en attente" value={42} hint="rafraîchi il y a 30 s" />);

    expect(screen.getByText('File en attente')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('rafraîchi il y a 30 s')).toBeInTheDocument();
  });

  it('remplace la valeur par un squelette en chargement — sans perdre le libellé', () => {
    const { container } = render(<StatCard label="Revenu 30 j" value={1000} loading />);

    expect(screen.getByText('Revenu 30 j')).toBeInTheDocument();
    expect(screen.queryByText('1000')).toBeNull();
    expect(container.querySelector('[data-slot="skeleton"]')).not.toBeNull();
  });

  it('rend un lien quand href est fourni, un simple bloc sinon', () => {
    const { rerender } = render(<StatCard label="Biens" value={3} href="/super-admin/properties" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/super-admin/properties');

    rerender(<StatCard label="Biens" value={3} />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  /**
   * `direction` porte le SENS, pas le signe : une baisse d'impayés est une bonne nouvelle, et ce
   * composant n'a aucun moyen de le savoir. La couleur suit donc la direction déclarée.
   */
  it('colore le delta selon la direction déclarée, jamais selon le signe de la valeur', () => {
    const { rerender } = render(
      <StatCard label="Impayés" value={12} delta={{ label: '−8 %', direction: 'up' }} />,
    );
    expect(screen.getByText('−8 %')).toHaveClass('text-accent');

    rerender(<StatCard label="Impayés" value={12} delta={{ label: '−8 %', direction: 'down' }} />);
    expect(screen.getByText('−8 %')).toHaveClass('text-destructive');
  });

  it('applique le ton danger à la valeur, et lui seul', () => {
    const { rerender } = render(<StatCard label="Échecs 24 h" value={7} tone="danger" />);
    expect(screen.getByText('7')).toHaveClass('text-destructive');

    rerender(<StatCard label="Échecs 24 h" value={7} />);
    expect(screen.getByText('7')).toHaveClass('text-foreground');
  });
});
