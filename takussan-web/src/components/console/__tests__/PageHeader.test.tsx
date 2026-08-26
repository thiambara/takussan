import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PageHeader } from '@/components/console';

describe('<PageHeader>', () => {
  it('rend le titre en h1, en font-display', () => {
    render(<PageHeader title="Utilisateurs" />);

    const titre = screen.getByRole('heading', { level: 1, name: 'Utilisateurs' });
    expect(titre).toHaveClass('font-display');
  });

  it('rend le sous-titre et la zone d’actions quand ils sont fournis', () => {
    render(
      <PageHeader
        title="Utilisateurs"
        description="Recherche cross-tenant."
        actions={<button type="button">Inviter</button>}
      />,
    );

    expect(screen.getByText('Recherche cross-tenant.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inviter' })).toBeInTheDocument();
  });

  it("n'ouvre aucun conteneur vide sans sous-titre ni actions", () => {
    const { container } = render(<PageHeader title="Utilisateurs" />);

    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelectorAll('div')).toHaveLength(1);
  });
});
