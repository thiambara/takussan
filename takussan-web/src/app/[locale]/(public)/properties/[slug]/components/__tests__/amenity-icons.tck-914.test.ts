/**
 * TCK-914 (P30.05) — chaque équipement du catalogue a son icône.
 *
 * L'icône se cherche par `tag.icon ?? tag.slug`, et aucun tag ne porte d'`icon` : c'est le slug du
 * catalogue qui décide. `AMENITY_ICONS` était indexé par des clés que le catalogue n'émet pas
 * (`cuisine`, `securite`, `salle_sport`…) : 26 équipements sur 35 retombaient sur l'icône générique.
 *
 * Le catalogue vit dans l'API (`TagCatalog::EQUIPEMENTS`) ; ce test lit le fichier PHP, comme
 * `libelle-equipement.test.ts` : un équipement ajouté sans icône rougit ici.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { slugDuCatalogue } from '@/lib/libelle-equipement';
import { AMENITY_ICONS, FALLBACK_AMENITY_ICON, getAmenityIcon } from '../amenity-icons';

const ROOT = resolve(process.cwd(), '..');
const SOURCE = readFileSync(join(ROOT, 'takussan-api', 'app', 'Services', 'Tags', 'TagCatalog.php'), 'utf8');

function slugsDuCatalogue(): string[] {
  const bloc = /const EQUIPEMENTS = \[([\s\S]*?)\];/.exec(SOURCE)?.[1] ?? '';
  return [...bloc.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => slugDuCatalogue(m[1].replace(/\\'/g, "'")));
}

describe('icônes des équipements du catalogue (TCK-914)', () => {
  const slugs = slugsDuCatalogue();

  it('le catalogue de l’API se lit', () => {
    expect(slugs.length).toBeGreaterThanOrEqual(30);
    expect(slugs).toContain('cuisine-equipee');
  });

  it.each(slugsDuCatalogue())('%s a une icône propre', (slug) => {
    expect(getAmenityIcon(slug)).not.toBe(FALLBACK_AMENITY_ICON);
  });

  it('les clés sont les slugs du catalogue, et rien d’autre', () => {
    expect(Object.keys(AMENITY_ICONS).sort()).toEqual([...slugs].sort());
  });
});
