import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';

import { DataTable, type DataTableColumn } from '@/components/console/DataTable';
import { EmptyState } from '@/components/feedback';

type Ligne = { id: number; nom: string };

const LIGNES: Ligne[] = [
  { id: 1, nom: 'Villa Yoff' },
  { id: 2, nom: 'Studio Plateau' },
];

const COLONNES: DataTableColumn<Ligne>[] = [
  { id: 'nom', header: 'Bien', cell: (l) => l.nom },
  { id: 'actions', header: 'Actions', headerSrOnly: true, align: 'end', cell: () => <button type="button">Ouvrir</button> },
];

const carte = (l: Ligne) => <p>Carte {l.nom}</p>;

/**
 * TCK-2331 (P08.07) — `carteMobile` : sous `md`, la table cède la place à une liste de cartes,
 * sur le patron de `CustomerList` et `PropertyList`. Sans elle, l'action de la dernière colonne ne
 * s'atteignait qu'après un défilement horizontal.
 *
 * jsdom n'applique aucune feuille de style : ce qui se garde, ce sont les classes qui font la
 * bascule (`hidden md:block` sur la table, `md:hidden` sur la liste) et le contenu de la liste.
 */
describe('<DataTable carteMobile>', () => {
  it('sans carteMobile, rien ne change : aucune liste, la table n’est jamais cachée', () => {
    const { container } = render(
      <DataTable caption="Biens" columns={COLONNES} rows={LIGNES} rowKey={(l) => l.id} data-testid="biens" />,
    );

    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByTestId('biens')).not.toHaveClass('hidden');
    expect(container.querySelector('.md\\:hidden')).toBeNull();
  });

  it('avec carteMobile, une carte par ligne dans une liste nommée par la légende, sous md seulement', () => {
    render(
      <DataTable
        caption="Biens"
        columns={COLONNES}
        rows={LIGNES}
        rowKey={(l) => l.id}
        carteMobile={carte}
        className="mt-2"
        data-testid="biens"
      />,
    );

    const liste = screen.getByRole('list', { name: 'Biens' });
    expect(liste).toHaveClass('md:hidden');
    const cartes = within(liste).getAllByRole('listitem');
    expect(cartes.map((c) => c.textContent)).toEqual(['Carte Villa Yoff', 'Carte Studio Plateau']);

    const cadreDeLaTable = screen.getByRole('table').closest('.ring-1');
    expect(cadreDeLaTable).toHaveClass('hidden', 'md:block');

    // Le cadre extérieur porte `className` et `data-testid`, et englobe les deux vues.
    const racine = screen.getByTestId('biens');
    expect(racine).toHaveClass('mt-2');
    expect(racine).toContainElement(liste);
    expect(racine).toContainElement(screen.getByRole('table'));
  });

  it('sans ligne, la vue en cartes montre l’état vide, comme la table', () => {
    render(
      <DataTable
        caption="Biens"
        columns={COLONNES}
        rows={[]}
        rowKey={(l: Ligne) => l.id}
        carteMobile={carte}
        emptyState={<EmptyState title="Aucun bien" />}
      />,
    );

    const vueMobile = screen.getByTestId('data-table-cartes');
    expect(vueMobile).toHaveClass('md:hidden');
    expect(within(vueMobile).getByText('Aucun bien')).toBeInTheDocument();
    expect(within(vueMobile).queryByRole('listitem')).not.toBeInTheDocument();
  });
});
