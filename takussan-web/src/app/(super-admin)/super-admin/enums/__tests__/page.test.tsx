/**
 * La console des enums métier est en lecture seule (angle 66 des pistes, ADR-0007).
 *
 * La liste des valeurs vit dans l'enum PHP : la validation (`Rule::enum`) et le cast du modèle ne
 * lisent qu'elle. Ce que la console écrivait n'était lu par aucune écriture ni aucun rendu :
 * - P66.01 (TCK-1055) : une valeur ajoutée était refusée en 422 à la création d'un bien.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { fetchBusinessEnums } from '@/lib/queries/super-admin';
import type { BusinessEnumsResponse } from '@/types/super-admin';
import SuperAdminEnumsPage from '../page';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchBusinessEnums: vi.fn(),
  deleteBusinessEnumValue: vi.fn(),
  patchBusinessEnumValue: vi.fn(),
}));

const ENUMS: BusinessEnumsResponse = {
  data: [
    {
      key: 'property_type',
      name: 'Types de biens',
      description: 'Catégories visibles dans les formulaires et les filtres de biens.',
      values: [
        {
          value: 'villa',
          labels: { fr: 'Villa', en: 'Villa', wo: 'Villa' },
          is_active: true,
          is_custom: false,
          usage_count: 2,
        },
      ],
    },
  ],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(withIntl(
    <QueryClientProvider client={queryClient}>
      <SuperAdminEnumsPage />
    </QueryClientProvider>,
  ));
}

afterEach(() => {
  vi.mocked(fetchBusinessEnums).mockReset();
});

describe('/super-admin/enums', () => {
  it("n'offre pas d'ajouter une valeur, et dit que la liste vit dans le code (P66.01)", async () => {
    vi.mocked(fetchBusinessEnums).mockResolvedValue(ENUMS);
    renderPage();

    expect(await screen.findByRole('cell', { name: 'villa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ajouter/i })).not.toBeInTheDocument();
    expect(
      screen.getByText('Les valeurs de ces listes vivent dans le code : en ajouter une demande un déploiement.'),
    ).toBeInTheDocument();
  });
});
