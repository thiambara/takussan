import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@/components/property-dashboard/PropertyList';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/app/actions/dashboard-properties', () => ({
  deletePropertyAction: vi.fn(),
  duplicatePropertyAction: vi.fn(),
  updatePropertyStatusAction: vi.fn(),
  updatePropertyVisibilityAction: vi.fn(),
}));

function makeProperty(overrides: Partial<PropertyListItem> = {}): PropertyListItem {
  return {
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
    ...overrides,
  };
}

function makePage(property: PropertyListItem): PaginatedResponse<PropertyListItem> {
  return {
    data: [property],
    meta: {
      total: 1,
      current_page: 1,
      last_page: 1,
      per_page: 20,
    },
  };
}

describe('PropertyList', () => {
  it('renders human labels for draft status instead of raw enum values', () => {
    render(
      <NextIntlClientProvider
        locale="fr"
        messages={{ common: { actions: { close: 'Fermer' } } }}
      >
        <PropertyList page={makePage(makeProperty())} />
      </NextIntlClientProvider>,
    );

    expect(screen.getAllByText('Brouillon').length).toBeGreaterThan(0);
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
  });
});
