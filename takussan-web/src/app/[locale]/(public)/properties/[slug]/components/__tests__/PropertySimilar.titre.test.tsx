/**
 * TCK-555 — le carrousel des biens similaires aligne des cartes VOISINES à toutes les largeurs :
 * sous `sm`, la diapositive suivante dépasse de 15 % à côté de la courante. Sans réserve de
 * hauteur pour le titre, leurs prix et leurs détails se décalaient (titres de 19 et 39 px
 * relevés à 360 px par la vérification adverse du tour 1).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

vi.mock('embla-carousel-react', () => ({ default: () => [vi.fn(), undefined] }));
vi.mock('@/hooks/useSimilarProperties', () => ({
  useSimilarProperties: () => ({ data: [{ id: 7 }, { id: 8 }], loading: false }),
}));
vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property, titreSurDeuxLignes }: { property: { id: number }; titreSurDeuxLignes?: string }) => (
    <article data-testid={`carte-${property.id}`} data-titre={titreSurDeuxLignes ?? ''} />
  ),
}));

import { PropertySimilar } from '../PropertySimilar';

describe('TCK-555 — PropertySimilar', () => {
  it('demande aux cartes de réserver deux lignes de titre à toutes les largeurs', () => {
    render(withIntl(<PropertySimilar slug="villa" />));
    expect(screen.getByTestId('carte-7')).toHaveAttribute('data-titre', 'toujours');
    expect(screen.getByTestId('carte-8')).toHaveAttribute('data-titre', 'toujours');
  });
});
