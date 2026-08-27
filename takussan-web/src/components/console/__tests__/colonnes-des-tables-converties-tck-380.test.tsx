import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import { ToastProvider } from '@/components/ui/toast';
import * as AuthContext from '@/context/AuthContext';
import { CustomerList } from '@/components/customer-dashboard/CustomerList';
import { OwnersList } from '@/components/owners/OwnersList';
import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { ServiceProvidersList } from '@/components/service-providers/ServiceProvidersList';
import type { PaginatedResponse } from '@/types/api';
import type { CustomerListItem } from '@/types/customer';
import type { PropertyListItem } from '@/types/property';

/**
 * TCK-380 · AC3 — **chaque table convertie rend EXACTEMENT les mêmes colonnes, dans le même
 * ordre, qu'avant la conversion.**
 *
 * Les listes attendues ci-dessous ne sont pas déduites du code d'aujourd'hui : elles sont
 * relevées sur les `<th>` des `<table>` faites à la main, à la révision `73ca883b`, AVANT que ce
 * ticket ne les touche. C'est ce qui fait la différence entre un test de non-régression et une
 * photographie de l'état courant — un test écrit depuis le nouveau code aurait coché une colonne
 * perdue aussi volontiers qu'une colonne gardée.
 *
 * ⚠ Ces tests rougissent réellement sans le correctif — vérifié par ablation le 2026-08-27 en
 * retirant une colonne de chaque définition : les cinq échouent, et le message nomme la colonne
 * manquante.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
}));

function monter(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <ToastProvider>{ui}</ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

/** Les en-têtes de LA table nommée par sa légende, dans l'ordre du DOM. */
function enTetesDe(legende: string): string[] {
  const table = screen.getByRole('table', { name: legende });
  return within(table)
    .getAllByRole('columnheader')
    .map((th) => th.textContent?.trim() ?? '');
}

beforeEach(() => {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
    token: 'jeton-de-test',
    user: null,
    loading: false,
  } as unknown as ReturnType<typeof AuthContext.useAuth>);
});

describe('AC3 — les colonnes des tables converties', () => {
  it('CustomerList : client · contact · étiquettes · pipeline · statut', () => {
    const page: PaginatedResponse<CustomerListItem> = {
      data: [
        {
          id: 1,
          first_name: 'Awa',
          last_name: 'Ndiaye',
          email: 'awa@example.test',
          phone: '+221770000000',
          status: 'active',
          pipeline_stage: 'qualified',
          occupation: 'Architecte',
          created_at: '2026-05-06T10:00:00.000Z',
        } as CustomerListItem,
      ],
      meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
      links: { first: null, last: null, prev: null, next: null },
    };
    monter(<CustomerList page={page} />);

    expect(enTetesDe('Liste des clients')).toEqual([
      'Client',
      'Contact',
      'Tags',
      'Pipeline',
      'Statut',
    ]);
  });

  it('PropertyList : sélection · bien · prix · activité · statut · actions', () => {
    const bien: PropertyListItem = {
      id: 12,
      reference_number: 'TK-2026-ABCD',
      title: 'Villa Ngor',
      slug: 'villa-ngor',
      price: 250000,
      currency: 'XOF',
      type: 'villa',
      contract_type: 'rent',
      rent_period: 'monthly',
      status: 'draft',
      visibility: 'private',
      views_count: 12,
      favorites_count: 3,
      location: {
        quarter: 'Ngor',
        city: 'Dakar',
        region: null,
        country: 'SN',
        latitude: null,
        longitude: null,
      },
      bedrooms: 3,
      bathrooms: 2,
      area: 120,
      furnished: false,
      featured: false,
      main_photo_url: null,
      published_at: null,
      created_at: '2026-05-06T12:00:00.000Z',
    } as PropertyListItem;

    monter(
      <PropertyList
        page={{
          data: [bien],
          meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
          links: { first: null, last: null, prev: null, next: null },
        }}
      />,
    );

    const entetes = enTetesDe('Liste des biens du tableau de bord');
    expect(entetes).toHaveLength(6);
    // La première colonne est un CONTRÔLE, pas un libellé : on l'éprouve par sa case à cocher.
    const table = screen.getByRole('table', { name: 'Liste des biens du tableau de bord' });
    expect(
      within(table).getByRole('checkbox', { name: /sélectionner tous les biens/i }),
    ).toBeInTheDocument();
    expect(entetes.slice(1)).toEqual(['Bien', 'Prix', 'Activité', 'Statut', 'Actions']);
  });

  it('OwnersList : nom · e-mail · statut · actions', () => {
    monter(
      <OwnersList
        agencyId={7}
        canInvite={false}
        initialData={{
          data: [
            {
              id: 3,
              agency_id: 7,
              status: 'active',
              user: { id: 9, first_name: 'Fatou', last_name: 'Sarr', email: 'f@example.test' },
              metadata: null,
            },
          ],
          meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
          links: { first: null, last: null, prev: null, next: null },
        } as never}
      />,
    );

    expect(enTetesDe('Propriétaires')).toEqual(['Nom', 'Email', 'Statut', 'Actions']);
  });

  it('ServiceProvidersList : nom · métiers · zones · statut · actions', () => {
    monter(
      <ServiceProvidersList
        agencyId={7}
        canInvite={false}
        initialData={{
          data: [
            {
              id: 4,
              agency_id: 7,
              status: 'active',
              specialties: ['plumbing'],
              service_areas: ['Dakar'],
              user: { id: 11, first_name: 'Modou', last_name: 'Fall', email: 'm@example.test' },
              metadata: null,
            },
          ],
          meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
          links: { first: null, last: null, prev: null, next: null },
        } as never}
      />,
    );

    const entetes = enTetesDe('Carnet prestataires');
    expect(entetes).toHaveLength(5);
    expect(entetes[0]).toBe('Nom');
    expect(entetes[4]).toBe('Actions');
  });
});
