import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { PropertyTag } from '@/types/property';

import { PropertyAmenities } from '../PropertyAmenities';

/**
 * TCK-1725 (P159.02) — l'icône d'un équipement se cherche dans `AMENITY_ICONS` par `tag.icon`,
 * puis par `tag.slug`, puis retombe sur l'icône générique. Avant, `getAmenityIcon(tag.icon ??
 * tag.slug)` : une icône saisie hors de la table (`waves`, un nom Lucide) masquait l'icône que le
 * slug donnait, et rendait `Building2`.
 */
const tag = (slug: string, icon: string | null): PropertyTag => ({
  id: 1, name: slug, slug, type: 'amenity', icon, color: null, status: 'approved',
});

function iconeRendue(t: PropertyTag): string {
  const { container } = render(withIntl(<PropertyAmenities tags={[t]} />));
  const svg = container.querySelector('svg');
  expect(svg).not.toBeNull();
  return svg?.getAttribute('class') ?? '';
}

describe('PropertyAmenities — l’icône (TCK-1725)', () => {
  it('un tag `piscine` d’icône `waves` (inconnue de la table) rend l’icône du slug, Waves', () => {
    expect(iconeRendue(tag('piscine', 'waves'))).toContain('lucide-waves');
  });

  it('une icône de la table l’emporte sur le slug', () => {
    expect(iconeRendue(tag('puits-traditionnel', 'jardin'))).toContain('lucide-tree-pine');
  });

  it('ni l’icône ni le slug dans la table : l’icône générique', () => {
    expect(iconeRendue(tag('puits-traditionnel', 'waves'))).toContain('lucide-building');
  });
});
