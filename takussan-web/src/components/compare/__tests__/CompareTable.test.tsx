import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import React from 'react';

import { CompareTable, type CompareColumn } from '../CompareTable';
import type { PropertyDetail } from '@/types/property';
import messages from '@/messages/fr.json';

vi.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
  }: {
    alt: string;
    src: string;
    [key: string]: unknown;
  }) => <img alt={alt} src={src} />,
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    className,
    title,
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    title?: string;
  }) => (
    <a href={href} className={className} title={title}>
      {children}
    </a>
  ),
}));

function wrap(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="fr" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>
  );
}

function makeProperty(overrides: Partial<PropertyDetail> = {}): PropertyDetail {
  return {
    id: 1,
    reference_number: 'TK-2026-ABC',
    title: 'Villa Almadies',
    slug: 'villa-almadies',
    price: 120_000_000,
    currency: 'XOF',
    type: 'villa',
    contract_type: 'sale',
    rent_period: null,
    status: 'available',
    visibility: 'public',
    bedrooms: 4,
    bathrooms: 3,
    area: 220,
    furnished: true,
    featured: false,
    main_photo_url: null,
    published_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    type_label: 'Villa',
    contract_type_label: 'Vente',
    rent_period_label: null,
    status_label: 'Disponible',
    title_type: null,
    title_type_label: null,
    floor_number: null,
    total_floors: null,
    available_from: null,
    year_built: 2020,
    parking_spaces: 2,
    views_count: 0,
    favorites_count: 0,
    average_rating: null,
    reviews_count: 0,
    description: null,
    photos: [],
    media_extra: { videos: [], plans: [], virtual_tour_url: null },
    tags: [
      { id: 1, name: 'WiFi', slug: 'wifi', type: 'amenity', icon: null, color: null },
      { id: 2, name: 'Piscine', slug: 'piscine', type: 'amenity', icon: null, color: null },
    ],
    owner: {
      id: 1,
      name: 'Fatou',
      avatar_url: null,
      is_agent: true,
      member_since: null,
    },
    agency: null,
    documents: [],
    price_history: [],
    rejection_reason: null,
    submitted_at: null,
    approved_at: null,
    rejected_at: null,
    location: {
      full: 'Almadies, Dakar',
      street: null,
      quarter: 'Almadies',
      city: 'Dakar',
      region: null,
      country: null,
      postal_code: null,
      latitude: null,
      longitude: null,
    },
    ...overrides,
  };
}

describe('<CompareTable>', () => {
  it('renders one column per property with accessible headers', () => {
    const columns: CompareColumn[] = [
      { id: 1, property: makeProperty({ id: 1, title: 'Villa A' }) },
      { id: 2, property: makeProperty({ id: 2, title: 'Villa B' }) },
    ];
    render(wrap(<CompareTable columns={columns} onRemove={() => undefined} />));

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Villa A')).toBeInTheDocument();
    expect(screen.getByText('Villa B')).toBeInTheDocument();
    // Row label for price
    expect(screen.getByText('Prix')).toBeInTheDocument();
  });

  it('highlights diverging rows via data-divergent="true"', () => {
    const columns: CompareColumn[] = [
      {
        id: 1,
        property: makeProperty({ id: 1, title: 'A', bedrooms: 3, area: 100 }),
      },
      {
        id: 2,
        property: makeProperty({ id: 2, title: 'B', bedrooms: 5, area: 100 }),
      },
    ];
    const { container } = render(
      wrap(<CompareTable columns={columns} onRemove={() => undefined} />),
    );

    const divergent = container.querySelectorAll('tr[data-divergent="true"]');
    const nonDivergent = container.querySelectorAll('tr[data-divergent="false"]');
    expect(divergent.length).toBeGreaterThan(0);
    expect(nonDivergent.length).toBeGreaterThan(0);

    // Bedrooms diverge, area does not — so at least one matching label should sit in each bucket
    const bedroomsRow = Array.from(divergent).find((row) =>
      row.textContent?.includes('Chambres'),
    );
    expect(bedroomsRow).toBeDefined();
    const areaRow = Array.from(nonDivergent).find((row) =>
      row.textContent?.includes('Surface'),
    );
    expect(areaRow).toBeDefined();
  });

  it('fires onRemove when the "Retirer" button is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    const columns: CompareColumn[] = [
      { id: 1, property: makeProperty({ id: 1, title: 'Villa A' }) },
      { id: 2, property: makeProperty({ id: 2, title: 'Villa B' }) },
    ];
    render(wrap(<CompareTable columns={columns} onRemove={onRemove} />));

    const buttons = screen.getAllByRole('button', { name: /Retirer/i });
    await user.click(buttons[0]);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it('renders a placeholder column for unavailable properties', () => {
    const onRemove = vi.fn();
    const columns: CompareColumn[] = [
      { id: 42, property: null },
      { id: 2, property: makeProperty({ id: 2, title: 'Villa B' }) },
    ];
    render(wrap(<CompareTable columns={columns} onRemove={onRemove} />));

    expect(screen.getByText('Bien indisponible')).toBeInTheDocument();
  });
});
