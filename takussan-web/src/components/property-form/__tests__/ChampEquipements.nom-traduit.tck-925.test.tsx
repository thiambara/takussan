import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm } from 'react-hook-form';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import type { PropertyFormValues } from '@/lib/schemas/property';
import type { Tag } from '@/types/tag';

import { ChampEquipements } from '../ChampEquipements';

/**
 * TCK-925 (P30.06) — un nom tapé égal, au repli près (casse, accents, tirets, apostrophes), au
 * libellé AFFICHÉ d'un équipement est cet équipement : il part dans `tag_ids`, pas en `tag_names`.
 * Le serveur ne replie que sur les noms français (`TagProposals`) : « tumble-dryer » tapé en anglais
 * y devenait une proposition en attente, doublon de « Sèche-linge ».
 */
const tag = (id: number, name: string, slug: string): Tag => ({
  id, name, slug, status: 'approved', type: 'amenity', icon: null, color: null, description: null,
});
const CATALOGUE = [tag(1, 'Sèche-linge', 'seche-linge'), tag(2, 'Sécurité 24/7', 'securite-247'), tag(3, 'Piscine', 'piscine')];

function rendre(locale: LocaleDeTest) {
  const valeurs: { current: Partial<PropertyFormValues> } = { current: {} };
  function Harnais() {
    const form = useForm<PropertyFormValues>({
      defaultValues: { tag_ids: [], tag_names: [] } as unknown as PropertyFormValues,
    });
    valeurs.current = form.watch();
    return <ChampEquipements form={form} tags={CATALOGUE} label="Équipements" />;
  }
  render(withIntl(<Harnais />, locale));
  return valeurs;
}

describe('TCK-925 — un nom tapé égal à un libellé traduit désigne l’équipement', () => {
  it('en anglais, « tumble-dryer » ajouté rattache « Sèche-linge »', async () => {
    const user = userEvent.setup();
    const valeurs = rendre('en');

    await user.type(screen.getByRole('combobox'), 'tumble-dryer');
    await user.click(await screen.findByRole('option', { name: 'Add “tumble-dryer”' }));

    expect(valeurs.current.tag_ids).toEqual([1]);
    expect(valeurs.current.tag_names).toEqual([]);
  });

  it('en français, « securite 24/7 » sans accents rattache « Sécurité 24/7 »', async () => {
    const user = userEvent.setup();
    const valeurs = rendre('fr');

    await user.type(screen.getByRole('combobox'), 'securite 24/7');
    await user.click(await screen.findByRole('option', { name: /Ajouter/ }));

    expect(valeurs.current.tag_ids).toEqual([2]);
    expect(valeurs.current.tag_names).toEqual([]);
  });

  it('un nom qui n’est le libellé d’aucun équipement reste une proposition', async () => {
    const user = userEvent.setup();
    const valeurs = rendre('en');

    await user.type(screen.getByRole('combobox'), 'Hammam');
    await user.click(await screen.findByRole('option', { name: 'Add “Hammam”' }));

    expect(valeurs.current.tag_ids).toEqual([]);
    expect(valeurs.current.tag_names).toEqual(['Hammam']);
  });
});
