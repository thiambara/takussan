import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { withIntl } from '@/test/intl';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
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
    links: { first: null, last: null, prev: null, next: null },
  };
}

describe('PropertyList', () => {
  it('renders human labels for draft status instead of raw enum values', () => {
    // TCK-292 — le provider montait `messages={{ common: … }}`, ce qui fait rendre la CLÉ et non
    // le libellé dès que l'écran passe au dictionnaire. `withIntl` charge le VRAI `fr.json` :
    // l'assertion française ci-dessous est INCHANGÉE, et c'est la forme vérifiable de l'AC3.
    render(withIntl(<PropertyList page={makePage(makeProperty())} />));

    expect(screen.getAllByText('Brouillon').length).toBeGreaterThan(0);
    expect(screen.queryByText('draft')).not.toBeInTheDocument();
  });

  /**
   * TCK-292 — la garde contre le mode d'échec principal du chantier.
   *
   * `src/i18n/request.ts` deep-merge `fr` sous TOUTE locale ≠ `fr` : une clé sans anglais
   * s'affiche EN FRANÇAIS, sans erreur, sans avertissement et sans test rouge. Ce test est le
   * seul endroit où ce silence devient bruyant — il rougit dès qu'une des clés anglaises de
   * `property.{status,visibility,dashboard.list}` disparaît, parce que le français reparaît alors
   * à l'écran anglais.
   */
  it('rend l’anglais en locale en — aucun libellé français ne subsiste', () => {
    render(withIntl(<PropertyList page={makePage(makeProperty())} />, 'en'));

    expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
    expect(screen.getByText('Property')).toBeInTheDocument();
    expect(screen.getByText('Activity')).toBeInTheDocument();
    expect(screen.queryByText('Brouillon')).not.toBeInTheDocument();
    expect(screen.queryByText('Activité')).not.toBeInTheDocument();
  });
});
