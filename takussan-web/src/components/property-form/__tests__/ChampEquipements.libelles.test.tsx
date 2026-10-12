import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';
import wo from '@/messages/wo.json';

import { ChampEquipements } from '../ChampEquipements';

/**
 * TCK-633 — dans le formulaire, un équipement du catalogue s'affiche dans la langue de l'écran
 * (traduit par son slug) ; un équipement saisi par un annonceur, tel qu'il a été saisi.
 */
const tag = (id: number, name: string, slug: string, status: Tag['status'] = 'approved'): Tag => ({
  id, name, slug, status, type: 'amenity', icon: null, color: null, description: null,
});
const CATALOGUE = [
  tag(1, 'Groupe électrogène', 'groupe-electrogene'),
  tag(2, 'Piscine', 'piscine'),
  tag(3, 'Puits traditionnel', 'puits-traditionnel'),
];
const PROPOSITION = tag(4, 'Bassin à poissons', 'bassin-a-poissons', 'pending');

function rendre(locale: LocaleDeTest, ids: number[]) {
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: { title: '', type: 'house', contract_type: 'sale', city: '', furnished: false, tag_ids: ids, tag_names: [] as string[] } as unknown as PropertyFormValues,
    });
    return <ChampEquipements form={form} tags={[...CATALOGUE, PROPOSITION]} label="Équipements" />;
  }
  render(withIntl(<Harnais />, locale));
}

const WO = (wo as { property: { amenityCatalog: Record<string, string> } }).property.amenityCatalog;

describe('ChampEquipements — les libellés', () => {
  it('en anglais, la puce d’un équipement du catalogue est traduite', () => {
    rendre('en', [1]);

    expect(screen.getByText('Backup generator')).toBeInTheDocument();
    expect(screen.queryByText('Groupe électrogène')).not.toBeInTheDocument();
  });

  it('en wolof, la puce d’un équipement du catalogue est traduite', () => {
    rendre('wo', [1]);

    expect(screen.getByText(WO['groupe-electrogene'])).toBeInTheDocument();
    expect(screen.queryByText('Groupe électrogène')).not.toBeInTheDocument();
  });

  it('un équipement saisi par un annonceur s’affiche tel quel, approuvé ou proposé', () => {
    rendre('en', [3, 4]);

    expect(screen.getByText('Puits traditionnel')).toBeInTheDocument();
    expect(screen.getByText('Bassin à poissons')).toBeInTheDocument();
  });

  it('la liste propose le catalogue dans la langue de l’écran', async () => {
    const user = userEvent.setup();
    rendre('en', []);

    await user.type(screen.getByRole('combobox'), 'pool');

    expect(await screen.findByRole('option', { name: 'Swimming pool' })).toBeInTheDocument();
  });
});
