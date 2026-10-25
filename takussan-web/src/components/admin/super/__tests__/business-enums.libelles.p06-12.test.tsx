import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EnumList, EnumValueTable } from '../business-enums';
import { withIntl } from '@/test/intl';
import type { BusinessEnum } from '@/types/super-admin';

/**
 * P06.12 (TCK-2336) — le catalogue super-admin affichait le `name` et la `description` que l'API
 * écrit en français, dans les trois langues. Le front rend désormais
 * `admin.businessEnums.<key>.name/description` ; le `name` de l'API reste le repli d'une entrée
 * que le dictionnaire ne connaît pas.
 */
const enumeration = (key: string, name: string, description: string): BusinessEnum => ({
  key,
  name,
  description,
  values: [
    { value: 'villa', labels: { fr: 'Villa', en: 'Villa', wo: 'Villa' }, is_active: true, is_custom: false, usage_count: 0 },
  ],
});

const TYPES = enumeration('property_type', 'Types de biens', 'Catégories visibles dans les formulaires et les filtres de biens.');
const FUTUR = enumeration('enum_de_demain', 'Énum de demain', 'Décrite par l’API seule.');

describe('catalogue des enums métier — libellés du front (P06.12)', () => {
  it('en anglais, la liste et la fiche rendent le libellé du dictionnaire, pas le français de l’API', () => {
    render(withIntl(
      <>
        <EnumList enums={[TYPES]} selectedKey="property_type" onSelect={() => {}} />
        <EnumValueTable item={TYPES} />
      </>,
      'en',
    ));

    expect(screen.getByRole('button', { name: /Property types/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Property types' })).toBeInTheDocument();
    expect(screen.getByText('Categories shown in property forms and filters.')).toBeInTheDocument();
    expect(screen.queryByText(/Types de biens|Catégories visibles/)).not.toBeInTheDocument();
  });

  it('une entrée sans clé au dictionnaire garde le nom et la description de l’API', () => {
    render(withIntl(
      <>
        <EnumList enums={[FUTUR]} selectedKey="enum_de_demain" onSelect={() => {}} />
        <EnumValueTable item={FUTUR} />
      </>,
      'en',
    ));

    expect(screen.getByRole('button', { name: /Énum de demain/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Énum de demain' })).toBeInTheDocument();
    expect(screen.getByText('Décrite par l’API seule.')).toBeInTheDocument();
  });
});
