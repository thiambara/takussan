/**
 * TCK-591, AC28 — un lot de 5 où l'API rend `updated = 3` et deux refus (`unchanged`,
 * `invalid_target`) : le bilan dit « 3 … 2 refusés » avec les deux motifs, laisse EXACTEMENT les
 * deux refus sélectionnés, et rafraîchit la liste. Avant : premier message seul, sélection entière,
 * pas de rafraîchissement.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

const { refresh, bulkUnpublish, canPublish } = vi.hoisted(() => ({
  refresh: vi.fn(),
  bulkUnpublish: vi.fn(),
  canPublish: { value: true },
}));

vi.mock('@/hooks/useCan', () => ({
  useCan: (capability: string) => ({
    can: capability === 'properties.publish' ? canPublish.value : true,
    isLoading: false,
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
  assignPropertyAgentAction: vi.fn(),
  bulkArchivePropertiesAction: vi.fn(),
  bulkUnpublishPropertiesAction: bulkUnpublish,
}));

const bien = (id: number): PropertyListItem => ({
  id,
  reference_number: `TK-${id}`,
  title: `Bien ${id}`,
  slug: `bien-${id}`,
  price: 100000,
  currency: 'XOF',
  type: 'apartment',
  contract_type: 'rent',
  rent_period: 'monthly',
  status: 'available',
  visibility: 'public',
  views_count: 0,
  favorites_count: 0,
  location: { quarter: null, city: 'Dakar', region: null, country: 'SN', latitude: null, longitude: null },
  bedrooms: 2,
  bathrooms: 1,
  area: 60,
  furnished: false,
  featured: false,
  main_photo_url: null,
  published_at: null,
  created_at: '2026-09-01T00:00:00Z',
} as PropertyListItem);

const page: PaginatedResponse<PropertyListItem> = {
  data: [1, 2, 3, 4, 5].map(bien),
  meta: { total: 5, current_page: 1, last_page: 1, per_page: 20 },
  links: { first: null, last: null, prev: null, next: null },
} as PaginatedResponse<PropertyListItem>;

describe('PropertyList — actions en masse (AC28)', () => {
  it('chiffre le bilan, motive les refus, ne garde qu’eux sélectionnés et rafraîchit', async () => {
    bulkUnpublish.mockResolvedValueOnce({
      ok: true,
      data: {
        updated: 3,
        updated_ids: [1, 2, 3],
        failed: [{ id: 4, reason: 'unchanged' }, { id: 5, reason: 'invalid_target' }],
      },
    });
    const user = userEvent.setup();
    render(withIntl(<PropertyList page={page} />));

    // Tout sélectionner, puis dépublier.
    await user.click(screen.getByRole('checkbox', { name: 'Sélectionner tous les biens' }));
    const barre = screen.getByRole('region', { name: 'Actions groupées' });
    await user.click(within(barre).getByRole('button', { name: /Dépublier/ }));

    await waitFor(() => expect(bulkUnpublish).toHaveBeenCalledWith([1, 2, 3, 4, 5]));
    const bilan = await within(barre).findByRole('status');
    expect(bilan).toHaveTextContent('3 biens dépubliés — 2 refusés :');
    expect(bilan).toHaveTextContent('Bien 4 : déjà dans cet état');
    expect(bilan).toHaveTextContent("Bien 5 : la cible n'est pas du personnel actif de l'agence");
    expect(refresh).toHaveBeenCalledTimes(1);

    // Chaque bien a deux cases (table et cartes) : on lit l'état par libellé.
    const coche = (n: number) =>
      screen.getAllByRole('checkbox', { name: `Sélectionner Bien ${n}` }).every((c) => (c as HTMLInputElement).checked);
    expect([1, 2, 3, 4, 5].filter(coche)).toEqual([4, 5]);
    expect(within(barre).getByText('2 biens sélectionnés')).toBeInTheDocument();
  });

  it('ne propose pas « Dépublier » sans properties.publish (TCK-587, comme à l’unité)', async () => {
    canPublish.value = false;
    try {
      const user = userEvent.setup();
      render(withIntl(<PropertyList page={page} />));
      await user.click(screen.getByRole('checkbox', { name: 'Sélectionner tous les biens' }));
      const barre = screen.getByRole('region', { name: 'Actions groupées' });
      expect(within(barre).getByRole('button', { name: /Archiver/ })).toBeInTheDocument();
      expect(within(barre).queryByRole('button', { name: /Dépublier/ })).toBeNull();
    } finally {
      canPublish.value = true;
    }
  });
});
