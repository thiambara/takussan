import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { PropertyTag } from '@/types/property';
import wo from '@/messages/wo.json';

import { PropertyAmenities } from '../PropertyAmenities';

/**
 * TCK-633 — sur l'annonce publique, un équipement du catalogue s'affiche dans la langue du
 * visiteur (traduit par son slug) ; un équipement saisi par l'annonceur, tel qu'il a été saisi.
 */
const tag = (id: number, name: string, slug: string): PropertyTag => ({
  id, name, slug, type: 'amenity', icon: null, color: null, status: 'approved',
});
const TAGS = [tag(1, 'Groupe électrogène', 'groupe-electrogene'), tag(2, 'Puits traditionnel', 'puits-traditionnel')];
const WO = (wo as { property: { amenityCatalog: Record<string, string> } }).property.amenityCatalog;

describe('PropertyAmenities — les libellés', () => {
  it('en anglais : le catalogue traduit, l’équipement de l’annonceur tel quel', () => {
    render(withIntl(<PropertyAmenities tags={TAGS} />, 'en'));

    expect(screen.getByText('Backup generator')).toBeInTheDocument();
    expect(screen.getByText('Puits traditionnel')).toBeInTheDocument();
    expect(screen.queryByText('Groupe électrogène')).not.toBeInTheDocument();
  });

  it('en wolof : le catalogue traduit, l’équipement de l’annonceur tel quel', () => {
    render(withIntl(<PropertyAmenities tags={TAGS} />, 'wo'));

    expect(screen.getByText(WO['groupe-electrogene'])).toBeInTheDocument();
    expect(screen.getByText('Puits traditionnel')).toBeInTheDocument();
  });

  it('en français : le libellé du catalogue', () => {
    render(withIntl(<PropertyAmenities tags={TAGS} />));

    expect(screen.getByText('Groupe électrogène')).toBeInTheDocument();
  });
});
