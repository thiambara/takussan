import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { PropertyListItem } from '@/types/property';
import { consommerArriveeSponsorisee } from '../arrivee-sponsorisee';
import { EmplacementsSponsorises } from '../EmplacementSponsorise';

vi.mock('@/components/property/PropertyCard', () => ({
  PropertyCard: ({ property, robe }: { property: PropertyListItem; robe?: string }) => (
    <a href={`/properties/${property.slug}`} data-robe={robe}>{property.title}</a>
  ),
}));

const BIEN = { id: 5, slug: 'villa-saly', title: 'Villa à Saly' } as unknown as PropertyListItem;

describe('EmplacementsSponsorises (TCK-633 lot F, ADR-0061 §7)', () => {
  beforeEach(() => sessionStorage.clear());

  // TCK-635 — la mention « Sponsorisé » est portée par la robe de la carte (`PropertyCard
  // robe="sponsorise"`, gardée par `PropertyCard.robe.test.tsx`), plus par une étiquette au-dessus.
  it('habille chaque emplacement de la robe « sponsorisé », et ne rend rien quand la liste est vide', () => {
    const { container, rerender } = render(withIntl(<EmplacementsSponsorises biens={[BIEN]} />));
    expect(screen.getByRole('link', { name: 'Villa à Saly' })).toHaveAttribute('data-robe', 'sponsorise');
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
