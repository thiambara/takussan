import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DataTable, type DataTableColumn } from '@/components/console';
import { EmptyState } from '@/components/feedback';

type Ligne = { id: number; nom: string; prix: number };

const LIGNES: Ligne[] = [
  { id: 1, nom: 'Villa Yoff', prix: 120 },
  { id: 2, nom: 'Studio Plateau', prix: 45 },
];

const COLONNES: DataTableColumn<Ligne>[] = [
  { id: 'nom', header: 'Bien', cell: (l) => l.nom },
  {
    id: 'prix',
    header: 'Prix',
    sortKey: 'price',
    sortLabel: 'Trier par prix',
    cell: (l) => l.prix,
  },
  { id: 'actions', header: 'Actions', headerSrOnly: true, align: 'end', cell: () => <button type="button">Ouvrir</button> },
];

function rendre(props: Partial<React.ComponentProps<typeof DataTable<Ligne>>> = {}) {
  return render(
    <DataTable
      caption="Biens de la plateforme"
      columns={COLONNES}
      rows={LIGNES}
      rowKey={(l) => l.id}
      {...props}
    />,
  );
}

describe('<DataTable>', () => {
  /**
   * AC3 — la légende et `scope="col"` sont les deux propriétés d'accessibilité que les onze
   * tables faites main de la console ne portaient pas (15 `scope` pour 11 tables, 0 `<caption>`).
   * Elles sont testées ici plutôt que sur chaque écran : c'est le seul point où elles se
   * décident, donc le seul où une régression est possible.
   */
  it("porte une légende sr-only et un scope='col' sur CHAQUE en-tête", () => {
    rendre();

    const table = screen.getByRole('table');
    expect(table).toHaveAccessibleName('Biens de la plateforme');
    expect(table.querySelector('caption')).toHaveClass('sr-only');

    const entetes = within(table).getAllByRole('columnheader');
    expect(entetes).toHaveLength(3);
    for (const entete of entetes) {
      expect(entete).toHaveAttribute('scope', 'col');
    }
  });

  it("cache visuellement l'en-tête de la colonne d'actions sans le retirer aux lecteurs d'écran", () => {
    rendre();

    const actions = within(screen.getByRole('table')).getAllByRole('columnheader')[2];
    expect(actions).toHaveTextContent('Actions');
    expect(actions.querySelector('span')).toHaveClass('sr-only');
  });

  it('rend une ligne par entrée, dans l’ordre reçu', () => {
    rendre();

    const lignes = within(screen.getByRole('table')).getAllByRole('row');
    // 1 en-tête + 2 données
    expect(lignes).toHaveLength(3);
    expect(within(lignes[1]).getByText('Villa Yoff')).toBeInTheDocument();
    expect(within(lignes[2]).getByText('Studio Plateau')).toBeInTheDocument();
  });

  /**
   * Le tri part de la chaîne spatie (`-price` / `price`), et la primitive compose la SUIVANTE.
   * C'est le point qu'aucun des trois écrans triables ne partageait : chacun re-dérivait la
   * bascule de direction, et l'un d'eux la dérivait dans son en-tête.
   */
  it('bascule la direction de tri et annonce aria-sort', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <DataTable
        caption="Biens"
        columns={COLONNES}
        rows={LIGNES}
        rowKey={(l) => l.id}
        sort={{ value: '-created_at', onChange }}
      />,
    );

    const prix = within(screen.getByRole('table')).getAllByRole('columnheader')[1];
    expect(prix).toHaveAttribute('aria-sort', 'none');

    // Colonne non triée → on demande la décroissante.
    await user.click(screen.getByRole('button', { name: 'Trier par prix' }));
    expect(onChange).toHaveBeenLastCalledWith('-price');

    rerender(
      <DataTable
        caption="Biens"
        columns={COLONNES}
        rows={LIGNES}
        rowKey={(l) => l.id}
        sort={{ value: '-price', onChange }}
      />,
    );
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')[1]).toHaveAttribute(
      'aria-sort',
      'descending',
    );

    // Déjà décroissante → on repasse en croissante.
    await user.click(screen.getByRole('button', { name: 'Trier par prix' }));
    expect(onChange).toHaveBeenLastCalledWith('price');
  });

  it('ne rend AUCUN bouton de tri sur une colonne sans sortKey', () => {
    rendre({ sort: { value: '-price', onChange: vi.fn() } });

    const nom = within(screen.getByRole('table')).getAllByRole('columnheader')[0];
    expect(within(nom).queryByRole('button')).toBeNull();
    expect(nom).not.toHaveAttribute('aria-sort');
  });

  it("rend l'état vide DANS le tbody, en gardant les en-têtes à l'écran", () => {
    rendre({
      rows: [],
      emptyState: <EmptyState title="Aucun bien" description="Publiez le premier." />,
    });

    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader')).toHaveLength(3);
    expect(within(table).getByText('Aucun bien')).toBeInTheDocument();
  });

  it("n'affiche rien de plus quand la table est vide et qu'aucun état vide n'est fourni", () => {
    rendre({ rows: [] });

    // Seule la ligne d'en-tête subsiste : pas de ligne fantôme.
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(1);
  });

  /**
   * AC2 — la densité est la propriété que ce composant existe pour tenir : cinq échelles de
   * padding cohabitaient dans la console. Le test la mesure sur le RENDU, pas sur la prop.
   */
  it('applique UNE SEULE échelle de padding, la même sur les th et les td', () => {
    const { container } = rendre();

    const paddings = new Set(
      [...container.querySelectorAll('th, td')].map((cellule) =>
        [...cellule.classList].filter((c) => /^p[xy]?-/.test(c)).sort().join(' '),
      ),
    );
    expect([...paddings]).toEqual(['px-3 py-2.5']);
  });

  it('propage rowProps sur la ligne — data-testid et classe de sélection', () => {
    rendre({ rowProps: (l: Ligne) => ({ 'data-testid': `ligne-${l.id}`, className: 'bg-muted' }) });

    expect(screen.getByTestId('ligne-1')).toHaveClass('bg-muted');
    expect(screen.getByTestId('ligne-2')).toBeInTheDocument();
  });
});
