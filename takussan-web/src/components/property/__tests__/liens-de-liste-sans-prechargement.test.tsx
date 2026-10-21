import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';

import { PropertyBreadcrumb } from '@/app/[locale]/(public)/properties/[slug]/components/PropertyBreadcrumb';
import { QuartiersDeLaVille } from '@/components/property/QuartiersDeLaVille';
import { PropertyRow } from '@/components/property/cards/PropertyRow';
import { withIntl } from '@/test/intl';
import type { PropertyDetail } from '@/types/property';

/**
 * TCK-1086 (P69.02) — un lien vers une liste dynamique ne se précharge pas.
 *
 * `next/link` précharge par défaut tout lien visible : sous `next start`, chaque visite de fiche
 * faisait rendre au serveur trois listes de 40 biens (fil d'Ariane), dont le navigateur ne
 * recevait que 2 Kio par lien, et l'accueil les listes de ses « Voir tout ». `prefetch` ne
 * paraît pas dans le DOM : `next/link` est remplacé par une ancre qui l'expose.
 */
vi.mock('next/link', () => ({
  default: ({ prefetch, href, children, ...props }: ComponentProps<'a'> & { prefetch?: boolean | null }) => (
    <a href={String(href)} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

function prechargements(liens: HTMLElement[]) {
  return liens.map((a) => [a.getAttribute('href'), a.getAttribute('data-prefetch')]);
}

describe('liens vers les listes dynamiques, sans préchargement', () => {
  it('le fil d’Ariane de la fiche : aucun maillon ne se précharge', () => {
    const bien = {
      contract_type: 'rent',
      location: { city: 'Dakar', quarter: 'Ngor' },
    } as unknown as PropertyDetail;
    render(
      withIntl(
        <PropertyBreadcrumb
          property={bien}
          hrefVille="/properties?city=Dakar"
          hrefQuartier="/properties?city=Dakar&location=Ngor"
        />,
      ),
    );

    const liens = within(screen.getByRole('navigation')).getAllByRole('link');
    expect(liens).toHaveLength(4);
    expect(prechargements(liens)).toEqual([
      ['/fr', 'false'],
      ['/fr/properties?contract_type=rent', 'false'],
      ['/fr/properties?city=Dakar', 'false'],
      ['/fr/properties?city=Dakar&location=Ngor', 'false'],
    ]);
  });

  it('les liens de quartier d’une page de ville', () => {
    render(
      withIntl(
        <QuartiersDeLaVille
          ville="Dakar"
          liens={[{ libelle: 'Ngor', href: '/properties?city=Dakar&location=Ngor' }]}
        />,
      ),
    );
    expect(prechargements(screen.getAllByRole('link'))).toEqual([
      ['/fr/properties?city=Dakar&location=Ngor', 'false'],
    ]);
  });

  it('le « Voir tout » d’une rangée de l’accueil', () => {
    render(
      withIntl(
        <PropertyRow
          title="Près de vous"
          viewAllHref="/properties?city=Dakar"
          variant="standard"
          properties={[]}
          loading={false}
          error={null}
        />,
      ),
    );
    expect(prechargements(screen.getAllByRole('link'))).toEqual([
      ['/fr/properties?city=Dakar', 'false'],
    ]);
  });
});
