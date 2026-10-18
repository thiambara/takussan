import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { ChampEquipements } from '@/components/property-form/ChampEquipements';
import type { PropertyFormValues } from '@/lib/schemas/property';
import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { Tag } from '@/types/tag';

/**
 * TCK-923 (P30.06) — les listes d'équipements se trient sur le libellé AFFICHÉ, pas sur le nom
 * français que l'API ordonne (`defaultSort('name')`, `COLLATE "und-x-icu"`). En anglais, la liste
 * commençait par « Lift · Balcony · Backup generator… ».
 */
const tag = (id: number, name: string, slug: string): Tag => ({
  id, name, slug, status: 'approved', type: 'amenity', icon: null, color: null, description: null,
});
// L'ordre de l'API : le nom français.
const CATALOGUE = [
  tag(1, 'Ascenseur', 'ascenseur'),
  tag(2, 'Balcon', 'balcon'),
  tag(3, 'Groupe électrogène', 'groupe-electrogene'),
  tag(4, 'Piscine', 'piscine'),
];

vi.mock('@/lib/queries/referentiel-public', () => ({
  useEquipementsApprouves: () => ({ data: { data: CATALOGUE } }),
}));
const { ChoixDEquipements } = await import('../ChoixDuReferentiel');

function rendreLeFormulaire(locale: LocaleDeTest) {
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: { tag_ids: [], tag_names: [] } as unknown as PropertyFormValues,
    });
    return <ChampEquipements form={form} tags={CATALOGUE} label="Équipements" />;
  }
  render(withIntl(<Harnais />, locale));
}

async function options() {
  await userEvent.setup().click(screen.getByRole('combobox'));
  await screen.findAllByRole('option');
  return screen.getAllByRole('option').map((o) => o.textContent);
}

describe('TCK-923 — l’ordre des équipements suit la langue de l’écran', () => {
  it('formulaire du bien, en anglais', async () => {
    rendreLeFormulaire('en');
    expect(await options()).toEqual(['Backup generator', 'Balcony', 'Lift', 'Swimming pool']);
  });

  it('formulaire du bien, en français : l’ordre du nom reste celui-là', async () => {
    rendreLeFormulaire('fr');
    expect(await options()).toEqual(['Ascenseur', 'Balcon', 'Groupe électrogène', 'Piscine']);
  });

  it('filtre de la recherche, en anglais', async () => {
    render(withIntl(<ChoixDEquipements valeurs={[]} onChange={vi.fn()} />, 'en'));
    expect(await options()).toEqual(['Backup generator', 'Balcony', 'Lift', 'Swimming pool']);
  });
});
