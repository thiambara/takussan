/**
 * TCK-2525 — les statistiques du boost disent aussi la place « Mise en avant » des agences : places
 * achetées et offertes, crédits dépensés et remboursés, tels que `GET /api/admin/boost-stats` les sert
 * dans `spotlights`. Le bloc tient même quand aucun emplacement n'a d'impression sur la période.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { AdminBoostStats } from '../AdminBoostStats';

vi.mock('../api', () => ({
  fetchBoostStats: () =>
    Promise.resolve({
      data: [],
      totals: { impressions: 0, clicks: 0, ctr: 0 },
      spotlights: { purchased: 3, offered: 1, credits_spent: 300, credits_refunded: 57 },
    }),
}));

describe('AdminBoostStats — mise en avant des agences (TCK-2525)', () => {
  it('affiche places achetées, offertes, crédits dépensés et remboursés, même sans impression', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(withIntl(
      <QueryClientProvider client={client}>
        <AdminBoostStats />
      </QueryClientProvider>,
    ));

    const bloc = await screen.findByRole('region', { name: 'Mise en avant des agences' });
    const valeur = (libelle: string) => within(bloc).getByText(libelle).nextElementSibling?.textContent;
    expect(valeur('Places achetées')).toBe('3');
    expect(valeur('Places offertes')).toBe('1');
    expect(valeur('Crédits dépensés')).toBe('300');
    expect(valeur('Crédits remboursés')).toBe('57');
    // L'état vide des emplacements reste dit à côté.
    expect(screen.getByText('Aucune donnée sur la période.')).toBeInTheDocument();
  });
});
