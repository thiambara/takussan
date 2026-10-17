import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LienDeCarte } from '@/components/property/cards/LienDeCarte';
import { withIntl } from '@/test/intl';
import type { PropertyListItem } from '@/types/property';
import { EmplacementsSponsorises } from '../EmplacementSponsorise';

// La vraie `LienDeCarte` : c'est elle qui porte le marqueur d'arrivée (TCK-794).
vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property, robe }: { property: PropertyListItem; robe?: string }) => (
    <div data-robe={robe}>
      <LienDeCarte slug={property.slug} idTitre={`titre-${property.id}`} />
      <h3 id={`titre-${property.id}`}>{property.title}</h3>
    </div>
  ),
}));

const BIEN = { id: 5, slug: 'villa-saly', title: 'Villa à Saly' } as unknown as PropertyListItem;

describe('EmplacementsSponsorises (TCK-633 lot F, ADR-0061 §7)', () => {
  // TCK-635 — la mention « Sponsorisé » est portée par la robe de la carte (`PropertyCard
  // robe="sponsorise"`, gardée par `PropertyCard.robe.test.tsx`), plus par une étiquette au-dessus.
  it('habille chaque emplacement de la robe « sponsorisé », et ne rend rien quand la liste est vide', () => {
    const { container, rerender } = render(withIntl(<EmplacementsSponsorises biens={[BIEN]} />));
    expect(screen.getByRole('link', { name: 'Villa à Saly' }).parentElement).toHaveAttribute('data-robe', 'sponsorise');
    expect(screen.getByRole('region', { name: 'Annonces sponsorisées' })).toBeInTheDocument();

    rerender(withIntl(<EmplacementsSponsorises biens={[]} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('TCK-794 — le lien d’un emplacement porte le marqueur d’arrivée `?src=sponsored`', () => {
    render(withIntl(<EmplacementsSponsorises biens={[BIEN]} />));
    expect(screen.getByRole('link', { name: 'Villa à Saly' })).toHaveAttribute('href', '/fr/properties/villa-saly?src=sponsored');
  });

  it('hors emplacement, le même lien n’en porte aucun', () => {
    render(withIntl(<><LienDeCarte slug="villa-saly" idTitre="t" /><h3 id="t">Villa à Saly</h3></>));
    expect(screen.getByRole('link', { name: 'Villa à Saly' })).toHaveAttribute('href', '/fr/properties/villa-saly');
  });
});
