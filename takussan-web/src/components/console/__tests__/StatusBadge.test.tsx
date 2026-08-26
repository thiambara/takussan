import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { StatusBadge, type StatusTone } from '@/components/console';

const TONS: StatusTone[] = ['neutral', 'success', 'attention', 'danger', 'info'];

describe('<StatusBadge>', () => {
  it('rend le libellé reçu et expose son ton en attribut', () => {
    render(<StatusBadge tone="success" label="Vérifiée" data-testid="badge" />);

    const badge = screen.getByTestId('badge');
    expect(badge).toHaveTextContent('Vérifiée');
    expect(badge).toHaveAttribute('data-tone', 'success');
  });

  it('retombe sur le ton neutre sans prop `tone`', () => {
    render(<StatusBadge label="Inconnu" data-testid="badge" />);

    expect(screen.getByTestId('badge')).toHaveAttribute('data-tone', 'neutral');
  });

  /**
   * La raison d'être de cette primitive : la console portait huit pastilles faites main en
   * `bg-amber-100` / `bg-emerald-100` / `bg-red-100` / `bg-stone-200` / `bg-green-50`. TCK-358
   * doit pouvoir changer la palette en touchant CE fichier et lui seul — ce qui n'est vrai que si
   * aucun ton ne cite une couleur Tailwind brute.
   */
  it.each(TONS)("n'utilise AUCUNE couleur Tailwind brute — ton %s", (tone) => {
    render(<StatusBadge tone={tone} label="X" data-testid="badge" />);

    const classes = screen.getByTestId('badge').className;
    expect(classes).not.toMatch(
      /\b(bg|text|ring|border)-(amber|emerald|red|green|blue|stone|slate|gray|zinc|sky|orange)-\d{2,3}\b/,
    );
  });

  it('rend une icône avant le libellé quand on lui en donne une', () => {
    render(<StatusBadge tone="danger" label="Suspendue" icon={<svg data-testid="icone" />} />);

    expect(screen.getByTestId('icone')).toBeInTheDocument();
  });
});
