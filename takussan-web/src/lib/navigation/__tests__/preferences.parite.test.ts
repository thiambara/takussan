import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PERSONAS } from '../personas';
import { SCHEMA_NAVIGATION } from '../preferences-schema';

/**
 * TCK-2480 (ADR-0089 §6, AC6) — parité avec l'API : `takussan-api/tests/fixtures/preferences-navigation.json`
 * est lue par CE test et par `tests/Feature/Api/Me/NavigationPreferencesTest.php`. Ce que le front lit
 * (et écrit) est exactement ce que `UpdateMeRequest` accepte.
 */
interface Cas {
  readonly nom: string;
  readonly navigation: unknown;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const fixture = JSON.parse(
  readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'preferences-navigation.json'), 'utf8'),
) as { personas: readonly string[]; valides: readonly Cas[]; invalides: readonly Cas[] };

/** `navigation: null` efface la clé côté API ; le schéma, lui, décrit une navigation PRÉSENTE. */
const SCHEMA_DU_CORPS = SCHEMA_NAVIGATION.nullable();

describe('preferences.navigation — parité avec UpdateMeRequest (TCK-2480)', () => {
  it('la fixture porte les huit personas du front, dans leur ordre', () => {
    expect(fixture.personas).toEqual([...PERSONAS]);
    expect(fixture.valides.length).toBeGreaterThanOrEqual(8);
    expect(fixture.invalides.length).toBeGreaterThanOrEqual(20);
  });

  it.each(fixture.valides.map((c) => [c.nom, c] as const))('accepte : %s', (_nom, cas) => {
    expect(SCHEMA_DU_CORPS.safeParse(cas.navigation).success).toBe(true);
  });

  it.each(fixture.invalides.map((c) => [c.nom, c] as const))('refuse : %s', (_nom, cas) => {
    expect(SCHEMA_DU_CORPS.safeParse(cas.navigation).success).toBe(false);
  });
});
