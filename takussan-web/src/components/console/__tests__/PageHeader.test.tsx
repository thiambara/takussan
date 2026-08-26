import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PageHeader } from '@/components/console';

/**
 * Ce fichier porte AUSSI les cas de l'ancien `layout/__tests__/PageHeader.test.tsx`, supprimé
 * avec son composant par TCK-373. Les reprendre plutôt que les jeter est ce qui rend la fusion
 * vérifiable : `eyebrow` et le slot d'actions ne sont couverts que par eux.
 */
describe('<PageHeader>', () => {
  it('rend le titre en h1, en font-display', () => {
    render(<PageHeader title="Utilisateurs" />);

    const titre = screen.getByRole('heading', { level: 1, name: 'Utilisateurs' });
    expect(titre).toHaveClass('font-display');
    expect(titre.className).toContain('text-foreground');
  });

  it('rend le sous-titre et la zone d’actions quand ils sont fournis', () => {
    render(
      <PageHeader
        title="Utilisateurs"
        description="Recherche cross-tenant."
        actions={<button type="button">Inviter</button>}
      />,
    );

    const description = screen.getByText('Recherche cross-tenant.');
    expect(description.tagName).toBe('P');
    expect(description.className).toContain('text-muted-foreground');
    expect(screen.getByRole('button', { name: 'Inviter' })).toBeInTheDocument();
  });

  it('rend l’eyebrow en petites capitales espacées, au-dessus du titre', () => {
    render(<PageHeader title="Finances" eyebrow="agence" />);

    const eyebrow = screen.getByText('agence');
    expect(eyebrow.className).toContain('uppercase');
    expect(eyebrow.className).toContain('tracking-');
  });

  it("n'ouvre aucun conteneur vide sans sous-titre ni actions", () => {
    const { container } = render(<PageHeader title="Utilisateurs" />);

    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelectorAll('div')).toHaveLength(1);
  });
});
