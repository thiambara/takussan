import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import type { PropertyListItem } from '@/types/property';

const fetchAgentPortfolio = vi.fn();
vi.mock('@/lib/queries/profile-portfolio', () => ({
  fetchAgentPortfolio: (...args: unknown[]) => fetchAgentPortfolio(...args),
  fetchAgencyPortfolio: vi.fn(),
}));

vi.mock('@/components/property/cards/PropertyCardStandard', () => ({
  PropertyCardStandard: ({ property }: { property: PropertyListItem }) => (
    <article data-testid="carte">{property.id}</article>
  ),
}));

import { PortfolioTabs } from '../PortfolioTabs';

function biens(debut: number, nombre: number, contrat: 'rent' | 'sale'): PropertyListItem[] {
  return Array.from({ length: nombre }, (_, i) => ({ id: debut + i, contract_type: contrat }) as PropertyListItem);
}

function page(data: PropertyListItem[], current: number, total: number) {
  return { data, meta: { current_page: current, last_page: Math.ceil(total / 24), per_page: 24, total } };
}

/**
 * TCK-1730 (P168.02) — un onglet « À louer » / « À vendre » se chargeait en filtrant côté client
 * les 24 biens les plus récents, tous contrats : 24 ventes chargées, 5 locations au total, et
 * l'onglet « À louer » rendait l'état vide, sans « Voir plus ». Chaque onglet a maintenant sa
 * liste et sa page, chargées par l'API (`filter[contract_type]`).
 */
describe('PortfolioTabs — chaque onglet se charge par son contrat (TCK-1730)', () => {
  beforeEach(() => fetchAgentPortfolio.mockReset());

  it('charge « À louer » par l’API quand ses biens ne sont pas dans les 24 premiers', async () => {
    fetchAgentPortfolio.mockResolvedValueOnce(page(biens(100, 5, 'rent'), 1, 5));
    render(withIntl(
      <PortfolioTabs
        portfolio={biens(1, 24, 'sale')}
        totals={{ all: 29, rent: 5, sale: 24 }}
        source={{ kind: 'agent', slug: 'awa-diop' }}
      />,
    ));

    await userEvent.click(screen.getByRole('tab', { name: /À louer/ }));

    await waitFor(() => expect(screen.getAllByTestId('carte')).toHaveLength(5));
    expect(fetchAgentPortfolio).toHaveBeenCalledWith('awa-diop', 1, 24, 'rent');
    expect(screen.queryByText('Pas encore de bien à louer')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Charger plus de biens' })).toBeNull();
  });

  it('compte « Voir plus » sur le total de l’onglet, et charge sa page suivante', async () => {
    fetchAgentPortfolio
      .mockResolvedValueOnce(page(biens(100, 24, 'rent'), 1, 30))
      .mockResolvedValueOnce(page(biens(200, 6, 'rent'), 2, 30));
    render(withIntl(
      <PortfolioTabs
        portfolio={biens(1, 24, 'sale')}
        totals={{ all: 54, rent: 30, sale: 24 }}
        source={{ kind: 'agent', slug: 'awa-diop' }}
      />,
    ));

    await userEvent.click(screen.getByRole('tab', { name: /À louer/ }));
    const plus = await screen.findByRole('button', { name: 'Charger plus de biens' });
    expect(plus).toHaveTextContent('6 restants');

    await userEvent.click(plus);

    await waitFor(() => expect(screen.getAllByTestId('carte')).toHaveLength(30));
    expect(fetchAgentPortfolio).toHaveBeenLastCalledWith('awa-diop', 2, 24, 'rent');
  });

  it('ne recharge pas un onglet dont tous les biens sont déjà chargés', async () => {
    render(withIntl(
      <PortfolioTabs
        portfolio={biens(1, 24, 'sale')}
        totals={{ all: 29, rent: 5, sale: 24 }}
        source={{ kind: 'agent', slug: 'awa-diop' }}
      />,
    ));

    await userEvent.click(screen.getByRole('tab', { name: /À vendre/ }));

    expect(screen.getAllByTestId('carte')).toHaveLength(24);
    expect(fetchAgentPortfolio).not.toHaveBeenCalled();
  });
});
