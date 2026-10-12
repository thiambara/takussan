import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyListItem } from '@/types/property';
import { consommerArriveeSponsorisee } from '../arrivee-sponsorisee';
import { EmplacementsSponsorises } from '../EmplacementSponsorise';

vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property }: { property: PropertyListItem }) => <a href={`/properties/${property.slug}`}>{property.title}</a>,
}));

const BIEN = { id: 5, slug: 'villa-saly', title: 'Villa à Saly' } as unknown as PropertyListItem;

describe('EmplacementsSponsorises (TCK-633 lot F, ADR-0061 §7)', () => {
  beforeEach(() => sessionStorage.clear());

  it('marque chaque emplacement « Sponsorisé » et rien quand la liste est vide', () => {
    const { container, rerender } = render(withIntl(<EmplacementsSponsorises biens={[BIEN]} />));
    expect(screen.getByText('Sponsorisé')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Annonces sponsorisées' })).toBeInTheDocument();

    rerender(withIntl(<EmplacementsSponsorises biens={[]} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('un clic sur le lien note l’arrivée par emplacement, consommée une fois', async () => {
    const user = userEvent.setup();
    render(withIntl(<EmplacementsSponsorises biens={[BIEN]} />));

    await user.click(screen.getByRole('link', { name: 'Villa à Saly' }));

    expect(consommerArriveeSponsorisee('villa-saly')).toBe(true);
    expect(consommerArriveeSponsorisee('villa-saly')).toBe(false);
  });
});
