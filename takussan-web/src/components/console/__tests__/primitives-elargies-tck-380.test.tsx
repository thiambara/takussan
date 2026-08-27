import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { DataTable, Pagination, type DataTableColumn } from '@/components/console';

/**
 * TCK-380 — les DEUX élargissements de primitive que l'adoption par `/app` a demandés.
 *
 * Chacun existe pour NE PAS perdre un comportement existant, jamais pour en offrir un neuf, et
 * chacun est éprouvé ici plutôt que sur son écran : c'est le seul endroit où il se décide.
 */

type Ligne = { readonly id: number; readonly nom: string };
const LIGNES: Ligne[] = [
  { id: 1, nom: 'Villa Yoff' },
  { id: 2, nom: 'Studio Plateau' },
];
const COLONNES: DataTableColumn<Ligne>[] = [{ id: 'nom', header: 'Bien', cell: (l) => l.nom }];

describe('<DataTable stickyHeader>', () => {
  /**
   * La table du tableau de bord des biens portait `sticky top-0 z-10 bg-muted/70 backdrop-blur`
   * sur son `<thead>`. Sans cette option, la conversion l'aurait retiré en silence — le genre de
   * perte qu'aucun test de colonne ne voit.
   */
  it("épingle l'en-tête quand on le demande", () => {
    const { container } = render(
      <DataTable
        caption="Biens"
        columns={COLONNES}
        rows={LIGNES}
        rowKey={(l) => l.id}
        stickyHeader
      />,
    );
    const thead = container.querySelector('thead');
    expect(thead).toHaveClass('sticky');
    expect(thead).toHaveClass('top-0');
    expect(thead).toHaveClass('backdrop-blur');
  });

  it("ne l'épingle PAS par défaut — les onze tables de console ne le demandaient pas", () => {
    const { container } = render(
      <DataTable caption="Biens" columns={COLONNES} rows={LIGNES} rowKey={(l) => l.id} />,
    );
    expect(container.querySelector('thead')).not.toHaveClass('sticky');
  });
});

describe('<Pagination summary>', () => {
  it('rend le résumé fourni à la place du « Page X sur Y » intégré', () => {
    render(
      withIntl(
        <Pagination
          page={2}
          lastPage={5}
          onChange={vi.fn()}
          summary={<span>128 résultats</span>}
        />,
      ),
    );

    expect(screen.getByText('128 résultats')).toBeInTheDocument();
    expect(screen.queryByText('Page 2 sur 5')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeInTheDocument();
  });

  /**
   * ⚠ Le cas qui décide. Sans résumé, une seule page ne rend rien — c'est la décision de
   * TCK-373. AVEC un résumé, l'appelant y a mis un compte de résultats et un sélecteur de
   * densité : les escamoter sur un jeu qui tient en une page serait une régression de
   * `PropertyPagination`, qui les affiche aujourd'hui.
   */
  it('rend quand même le résumé sur une seule page, alors que la forme nue ne rend rien', () => {
    const { container: nue } = render(
      withIntl(<Pagination page={1} lastPage={1} onChange={vi.fn()} />),
    );
    expect(nue).toBeEmptyDOMElement();

    render(
      withIntl(
        <Pagination page={1} lastPage={1} onChange={vi.fn()} summary={<span>3 résultats</span>} />,
      ),
    );
    expect(screen.getByText('3 résultats')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled();
  });

  it("borne toujours ce qu'elle émet, résumé ou pas", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      withIntl(
        <Pagination page={1} lastPage={3} onChange={onChange} summary={<span>résumé</span>} />,
      ),
    );

    const nav = screen.getByRole('navigation', { name: /pagination/i });
    await user.click(within(nav).getByRole('button', { name: /suivant/i }));
    expect(onChange).toHaveBeenLastCalledWith(2);
  });
});
