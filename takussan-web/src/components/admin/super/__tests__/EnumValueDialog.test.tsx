/**
 * Le dialogue de valeur d'enum métier n'existe plus (angle 66 des pistes).
 *
 * Il ajoutait une valeur (retirée par TCK-1055 : refusée en 422 à la création d'un bien) puis
 * éditait ses libellés FR / EN / WO (retirée par TCK-1057 : aucun rendu ne les lisait). Ce fichier
 * éprouvait l'ajout ; il garde désormais le retrait, au niveau du composant : la table des valeurs
 * ne porte plus aucun geste, et le module n'exporte plus de dialogue. La page entière est éprouvée
 * par `app/(super-admin)/super-admin/enums/__tests__/page.test.tsx`.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import * as businessEnums from '../business-enums';
import { EnumValueTable } from '../business-enums';
import { withIntl } from '@/test/intl';
import type { BusinessEnum } from '@/types/super-admin';

const ENUM: BusinessEnum = {
  key: 'property_type',
  name: 'Types de biens',
  description: '',
  values: [
    { value: 'villa', labels: { fr: 'Villa', en: 'Villa', wo: 'Villa' }, is_active: true, is_custom: false, usage_count: 2 },
    { value: 'farm', labels: { fr: 'Ferme', en: 'Farm', wo: 'Ferme' }, is_active: true, is_custom: false, usage_count: 0 },
  ],
};

describe('<EnumValueTable> en lecture seule', () => {
  it("ne porte aucun bouton, ni d'ajout, ni de modification, ni de désactivation", () => {
    render(withIntl(<EnumValueTable item={ENUM} />));

    const table = screen.getByRole('table');
    expect(within(table).getByRole('cell', { name: 'villa' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it("le module n'exporte plus de dialogue de valeur", () => {
    expect(Object.keys(businessEnums).sort()).toEqual(['EnumList', 'EnumValueTable']);
  });
});
