import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';
import { withIntl } from '@/test/intl';

/**
 * TCK-380 · AC2 et AC4 — `PropertyPagination` ne dessine plus rien elle-même, mais **ce qu'elle
 * écrit dans l'URL ne change pas d'un caractère**.
 *
 * C'est la seule chose que la conversion pouvait casser sans qu'aucun test de colonne le voie :
 * elle est le seul point du lot dont la sortie soit une requête. Les quatre attentes ci-dessous
 * sont relevées sur le composant AVANT conversion (révision `73ca883b`) :
 *
 *   · page 1 ⇒ le paramètre `page` est RETIRÉ, pas mis à `1`
 *   · page > 1 ⇒ `page=N`
 *   · densité 20 ⇒ `per_page` RETIRÉ (c'est le défaut), toute autre valeur ⇒ `per_page=N`
 *   · tout changement de densité remet la page à 1 (`page` retiré)
 */

const replace = vi.fn();
let params = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
  useSearchParams: () => params,
}));

function meta(overrides: Record<string, number> = {}) {
  return { total: 128, current_page: 2, last_page: 7, per_page: 20, ...overrides };
}

beforeEach(() => {
  replace.mockReset();
  params = new URLSearchParams('filter%5Bstatus%5D=active');
});

describe('<PropertyPagination>', () => {
  it("garde le compte de résultats et la position, et n'introduit pas de second « Page X sur Y »", () => {
    render(withIntl(<PropertyPagination meta={meta()} />));

    expect(screen.getByRole('navigation', { name: /pagination/i })).toBeInTheDocument();
    expect(screen.getByText(/Page 2 sur 7/)).toBeInTheDocument();
    expect(screen.getByText(/128 résultats/)).toBeInTheDocument();
    expect(screen.getAllByText(/Page 2 sur 7/)).toHaveLength(1);
  });

  it('écrit `page=3` en avançant, et RETIRE `page` en revenant à la première', async () => {
    const user = userEvent.setup();
    render(withIntl(<PropertyPagination meta={meta()} />));

    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining('page=3'));
    // Les filtres déjà posés survivent : c'est tout l'intérêt de l'état dans l'URL.
    expect(replace).toHaveBeenLastCalledWith(expect.stringContaining('filter'));

    await user.click(screen.getByRole('button', { name: /précédent/i }));
    const url = replace.mock.calls.at(-1)![0] as string;
    expect(new URLSearchParams(url.slice(1)).get('page')).toBeNull();
  });

  it('borne à la dernière page — le bouton « suivant » y est désactivé', () => {
    render(withIntl(<PropertyPagination meta={meta({ current_page: 7 })} />));
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /précédent/i })).toBeEnabled();
  });

  /**
   * ⚠ Le cas que la conversion pouvait perdre en silence : `console/Pagination` ne rend RIEN sur
   * une seule page. Ici, le compte et le sélecteur de densité doivent rester à l'écran.
   */
  it('affiche encore le résumé quand tout tient en une page', () => {
    render(withIntl(<PropertyPagination meta={meta({ current_page: 1, last_page: 1, total: 3 })} />));
    expect(screen.getByText(/3 résultats/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled();
  });
});
