import { render, screen } from '@testing-library/react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';

import { EmptyState } from '@/components/feedback';

/**
 * Un composant d'état vide qui ne rendrait rien passerait inaperçu : il ne s'affiche, par
 * définition, que quand il n'y a rien à afficher. D'où des assertions sur le RENDU, pas
 * seulement sur l'absence d'erreur.
 */
describe('EmptyState', () => {
  it('rend le titre comme un titre de section, la description et le CTA', () => {
    render(
      <EmptyState
        icon={<svg data-testid="icon" />}
        title="Aucun bail pour le moment"
        description="Créez votre premier bail."
        action={<Link href="/app/leases/new">Nouveau bail</Link>}
      />,
    );

    expect(
      screen.getByRole('heading', { level: 2, name: 'Aucun bail pour le moment' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Créez votre premier bail.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nouveau bail' })).toHaveAttribute(
      'href',
      '/app/leases/new',
    );
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('se contente du titre quand description, icône et CTA sont absents', () => {
    const { container } = render(<EmptyState title="File vide" />);

    expect(screen.getByRole('heading', { level: 2, name: 'File vide' })).toBeInTheDocument();
    // Un seul enfant : le titre. Rien ne rend de conteneur vide « au cas où ».
    expect(container.querySelector('div')?.children).toHaveLength(1);
  });

  it('laisse passer className et les props résiduelles', () => {
    // Les deux besoins qui ont dicté la signature : `PropertiesDiscoveryPage` rend son état vide
    // DANS une grille (`col-span-full`), et `TeamConsole` ancre un `data-testid` dessus.
    render(
      <EmptyState className="col-span-full" data-testid="team-console-empty" title="Vide" />,
    );

    const node = screen.getByTestId('team-console-empty');
    expect(node).toHaveClass('col-span-full');
    // Les classes de base survivent à la fusion `cn()` — sinon la surcharge écraserait le style.
    expect(node).toHaveClass('rounded-xl');
  });
});
