import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import messages from '@/messages/fr.json';
import { RecentlyViewedCarousel } from '../RecentlyViewedCarousel';
import type { PropertyListItem } from '@/types/property';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockClear = vi.fn();
let mockItems: PropertyListItem[] = [];
let mockLoading = false;
let mockExcludeId: number | undefined;

vi.mock('@/hooks/useRecentlyViewed', () => ({
  useRecentlyViewed: (excludeId?: number) => {
    mockExcludeId = excludeId;
    return {
      items: mockItems,
      loading: mockLoading,
      push: vi.fn(),
      clear: mockClear,
    };
  },
}));

vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property }: { property: PropertyListItem }) => (
    <div data-testid={`card-${property.id}`}>{property.title}</div>
  ),
}));

vi.mock('@/components/property/cards/PropertyRow', () => ({
  PropertyRow: ({
    title,
    properties,
    loading,
    action,
  }: {
    title: string;
    properties: readonly PropertyListItem[];
    loading: boolean;
    action?: { label: string; onClick: () => void };
  }) => (
    <section>
      <h2>{title}</h2>
      {action ? <button type="button" onClick={action.onClick}>{action.label}</button> : null}
      {loading ? (
        <div data-testid="recently-viewed-skeleton" />
      ) : (
        properties.map((property) => (
          <div key={property.id} data-testid={`card-${property.id}`}>
            {property.title}
          </div>
        ))
      )}
    </section>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProperty(id: number): PropertyListItem {
  return {
    id,
    slug: `prop-${id}`,
    title: `Property ${id}`,
    price: 1000,
    currency: 'XOF',
    type: 'house',
    contract_type: 'rent',
    rent_period: 'monthly',
    bedrooms: null,
    bathrooms: null,
    area: null,
    furnished: false,
    featured: false,
    main_photo_url: null,
    published_at: null,
    created_at: '2024-01-01',
    location: { quarter: null, city: 'Dakar', region: null, country: null, latitude: null, longitude: null },
    reference_number: '',
    status: null,
    visibility: null,
  };
}

function wrap(excludeId?: number) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      <RecentlyViewedCarousel excludeId={excludeId} />
    </NextIntlClientProvider>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('<RecentlyViewedCarousel>', () => {
  beforeEach(() => {
    mockItems = [];
    mockLoading = false;
    mockExcludeId = undefined;
    mockClear.mockClear();
  });

  it('renders nothing when there are 0 items (AC6)', () => {
    mockItems = [];
    const { container } = render(wrap());
    expect(container.firstChild).toBeNull();
  });

  it('renders the carousel when there is 1 item', () => {
    mockItems = [makeProperty(1)];
    render(wrap());
    expect(screen.getByTestId('card-1')).toBeInTheDocument();
  });

  it('renders the carousel section with cards when there are 2+ items', () => {
    mockItems = [makeProperty(1), makeProperty(2)];
    render(wrap());
    expect(screen.getByTestId('card-1')).toBeInTheDocument();
    expect(screen.getByTestId('card-2')).toBeInTheDocument();
  });

  it('shows the section title "Récemment consultés"', () => {
    mockItems = [makeProperty(1), makeProperty(2)];
    render(wrap());
    expect(screen.getByText('Récemment consultés')).toBeInTheDocument();
  });

  it('the current property is absent from its own carousel (AC5) — hook receives excludeId', () => {
    // The hook filters by excludeId; here it returns items without id=1.
    mockItems = [makeProperty(2), makeProperty(3)];
    render(wrap(1));
    expect(mockExcludeId).toBe(1);
    expect(screen.queryByTestId('card-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-2')).toBeInTheDocument();
    expect(screen.getByTestId('card-3')).toBeInTheDocument();
  });

  it('shows the "Effacer l\'historique" button', () => {
    mockItems = [makeProperty(1), makeProperty(2)];
    render(wrap());
    expect(screen.getByText("Effacer l'historique")).toBeInTheDocument();
  });

  it('clicking "Effacer l\'historique" opens the confirm dialog (AC7)', () => {
    mockItems = [makeProperty(1), makeProperty(2)];
    render(wrap());
    fireEvent.click(screen.getByText("Effacer l'historique"));
    expect(screen.getByText('Effacer l\'historique ?')).toBeInTheDocument();
  });

  it('confirming the dialog calls clear() (AC7)', () => {
    mockItems = [makeProperty(1), makeProperty(2)];
    render(wrap());
    fireEvent.click(screen.getByText("Effacer l'historique"));
    // The confirm button inside the dialog
    const confirmBtn = screen.getByRole('button', { name: /^Effacer$/i });
    fireEvent.click(confirmBtn);
    expect(mockClear).toHaveBeenCalledOnce();
  });

  it('renders skeleton loaders while loading, not actual cards', () => {
    mockLoading = true;
    mockItems = [];
    render(wrap());
    // While loading, the section title is visible but no cards
    expect(screen.getByText('Récemment consultés')).toBeInTheDocument();
    expect(screen.getByTestId('recently-viewed-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('card-1')).not.toBeInTheDocument();
  });
});
