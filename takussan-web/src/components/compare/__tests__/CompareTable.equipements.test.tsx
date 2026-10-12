/**
 * TCK-633 — le comparateur nomme les équipements dans la langue de l'écran (`libelleEquipement`,
 * lot D) : un équipement du catalogue est traduit par son slug, un équipement proposé par un
 * annonceur (`pending`, ou hors catalogue) reste tel quel. Les deux rendus — table et carrousel
 * mobile — partagent `buildCompareRows` ; chacun est monté ici.
 *
 * Avant : `amenityNames` rendait `tag.name`, et « Piscine » restait « Piscine » sous l'anglais.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import { CompareTable } from '../CompareTable';
import { CompareCarousel } from '../CompareCarousel';
import { makeProperty } from './bien-de-test';
import type { PropertyTag } from '@/types/property';

vi.mock('next/image', () => ({
  __esModule: true,
  // eslint-disable-next-line @next/next/no-img-element -- doublure de `next/image` dans un test.
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

const TAGS: PropertyTag[] = [
  { id: 1, name: 'Piscine', slug: 'piscine', type: 'amenity', icon: null, color: null, status: 'approved' },
  { id: 2, name: 'Climatisation', slug: 'climatisation', type: 'amenity', icon: null, color: null },
  // Proposé par l'annonceur : son texte, même si son slug ressemble à une clé connue.
  { id: 3, name: 'Piscine chauffée maison', slug: 'piscine', type: 'amenity', icon: null, color: null, status: 'pending' },
  // Approuvé hors catalogue : aucune clé de traduction, le nom en base.
  { id: 4, name: 'Jardin potager', slug: 'jardin-potager', type: 'amenity', icon: null, color: null, status: 'approved' },
];

const colonnes = [
  { id: 1, property: makeProperty({ id: 1, tags: TAGS }) },
  { id: 2, property: makeProperty({ id: 2, slug: 'autre', tags: [] }) },
];

function equipementsAffiches(): string[] {
  return screen.getAllByRole('listitem')
    .map((li) => li.textContent ?? '')
    .filter((texte) => ['Piscine', 'Swimming', 'Pisin', 'Clim', 'Air', 'Klim', 'Jardin'].some((d) => texte.startsWith(d)));
}

describe.each([
  ['table', (locale: LocaleDeTest) => render(withIntl(<CompareTable columns={colonnes} onRemove={() => {}} />, locale))],
  ['carrousel', (locale: LocaleDeTest) => render(withIntl(<CompareCarousel columns={colonnes} onRemove={() => {}} />, locale))],
] as const)('comparateur (%s) — équipements traduits (TCK-633)', (_nom, monte) => {
  it('en anglais : le catalogue traduit, l’équipement d’annonceur tel quel', () => {
    monte('en');
    const affiches = equipementsAffiches();
    expect(affiches).toEqual(expect.arrayContaining(['Swimming pool', 'Air conditioning', 'Piscine chauffée maison', 'Jardin potager']));
    expect(affiches).not.toContain('Piscine');
    expect(affiches).not.toContain('Climatisation');
  });

  it('en wolof : le catalogue traduit', () => {
    monte('wo');
    const affiches = equipementsAffiches();
    expect(affiches).toEqual(expect.arrayContaining(['Pisin', 'Klimatisasioŋ', 'Piscine chauffée maison', 'Jardin potager']));
    expect(affiches).not.toContain('Piscine');
  });
});
