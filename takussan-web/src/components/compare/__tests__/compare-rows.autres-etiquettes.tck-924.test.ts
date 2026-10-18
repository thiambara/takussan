import { describe, expect, it } from 'vitest';

import en from '@/messages/en.json';
import { libelleEquipement, type TraducteurDuCatalogue } from '@/lib/libelle-equipement';
import type { PropertyTag } from '@/types/property';

import { buildCell, COMPARE_ROW_DEFS } from '../compare-rows';
import { makeProperty } from './bien-de-test';

/**
 * TCK-924 (P30.06) — la ligne « Tags » du comparateur (`otherTagNames`) passe par le même
 * traducteur que la ligne « Équipements », et se trie sur le libellé affiché. Avant, elle rendait
 * le nom brut : un `feature` du catalogue que `tags:sync-catalog` n'a pas encore converti restait
 * « Groupe électrogène » sous l'anglais.
 */
const CATALOGUE = (en as { property: { amenityCatalog: Record<string, string> } }).property.amenityCatalog;
const t = ((cle: string) => CATALOGUE[cle]) as TraducteurDuCatalogue;
t.has = (cle: string) => cle in CATALOGUE;

const TAGS: PropertyTag[] = [
  { id: 1, name: 'Groupe électrogène', slug: 'groupe-electrogene', type: 'feature', icon: null, color: null, status: 'approved' },
  { id: 2, name: 'Ascenseur', slug: 'ascenseur', type: 'feature', icon: null, color: null, status: 'approved' },
  { id: 3, name: 'Coup de cœur', slug: 'coup-de-coeur', type: 'label', icon: null, color: null, status: 'approved' },
];
const ligneTags = COMPARE_ROW_DEFS.find((d) => d.id === 'tags')!;

describe('TCK-924 — les autres étiquettes du comparateur', () => {
  it('passent par le traducteur et se trient sur le libellé affiché', () => {
    const cellule = buildCell(ligneTags, makeProperty({ tags: TAGS }), (tag) => libelleEquipement(tag, t));
    expect(cellule).toEqual(['Backup generator', 'Coup de cœur', 'Lift']);
  });

  it('sans traducteur (appelant hors React), le nom en base', () => {
    expect(buildCell(ligneTags, makeProperty({ tags: TAGS }))).toEqual(['Ascenseur', 'Coup de cœur', 'Groupe électrogène']);
  });
});
