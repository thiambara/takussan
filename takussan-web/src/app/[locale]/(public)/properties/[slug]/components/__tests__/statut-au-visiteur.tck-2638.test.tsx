/**
 * TCK-2638 (décision du team-lead, 2026-11-14) — « Validé » (`published`) est un état de modération
 * interne : depuis que l'API le dit ainsi (ADR-0097 § 4), la fiche PUBLIQUE l'affichait au visiteur,
 * en pastille sous le titre et en ligne « Statut » des caractéristiques. Un bien en ligne est
 * visible par définition : ni `published` ni `available` ne se disent au visiteur. Réservé, vendu et
 * loué, eux, l'informent et restent.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';
import { PropertyCharacteristics } from '../PropertyCharacteristics';
import { PropertyHeader } from '../PropertyHeader';

vi.mock('@/components/compare/CompareToggleAction', () => ({ CompareToggleAction: () => null }));

function bien(status: string, status_label: string): PropertyDetail {
  return {
    id: 1,
    title: 'Villa Mermoz',
    slug: 'villa-mermoz',
    price: 650_000,
    currency: 'XOF',
    type: 'villa',
    contract_type: 'rent',
    rent_period: 'monthly',
    type_label: 'Villa',
    contract_type_label: 'À louer',
    rent_period_label: 'Par mois',
    status,
    status_label,
    visibility: 'public',
    views_count: 3,
    reviews_count: 0,
    average_rating: null,
    reference_number: 'TK-1',
    featured: false,
    condition: null,
    location: { quarter: 'Mermoz', city: 'Dakar', region: null, country: 'SN', full: 'Mermoz, Dakar', latitude: null, longitude: null },
    title_type_label: null,
    floor_number: null,
    total_floors: null,
    year_built: null,
    parking_spaces: null,
    furnished: false,
  } as never;
}

const rendre = (p: PropertyDetail) =>
  render(
    withIntl(
      <>
        <PropertyHeader property={p} onToggleFavorite={() => {}} onShare={() => {}} isFavorite={false} />
        <PropertyCharacteristics property={p} />
      </>,
    ),
  );

describe('Fiche publique — le statut dit au visiteur (TCK-2638)', () => {
  it.each([
    ['published', 'Validé'],
    ['available', 'Disponible'],
  ])('un bien en ligne (%s) : ni pastille ni ligne « Statut »', (status, libelle) => {
    rendre(bien(status, libelle));
    expect(screen.queryByText(libelle)).toBeNull();
    expect(screen.queryByText('Statut')).toBeNull();
  });

  it.each([
    ['reserved', 'Réservé'],
    ['sold', 'Vendu'],
    ['rented', 'Loué'],
  ])('%s : le statut informe le visiteur, il reste', (status, libelle) => {
    rendre(bien(status, libelle));
    expect(screen.getAllByText(libelle)).toHaveLength(2);
  });
});
