import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * TCK-2129 (P219.01) — concordance avec l'API : `takussan-api/tests/fixtures/healthcheck-sondes.json`
 * est lu par CE test et par `HealthcheckTuilesConcordanceTest` (API), qui la compare aux sondes que
 * `HealthcheckService::snapshot()` émet. Ici : la liste `CHECKS` de `system-health.tsx` porte une
 * tuile pour chacune, et aucune de plus.
 *
 * TCK-2131 (P219.02) — même fixture, pour les motifs (`'reason' =>`) : `HealthcheckMotifsConcordanceTest`
 * la compare aux motifs émis, ce test à l'union `HealthReason` de `super-admin.ts`.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
const fixture = JSON.parse(
  readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'healthcheck-sondes.json'), 'utf8'),
) as { sondes: string[]; motifs: string[] };

function lireChecks(): string[] {
  const source = readFileSync(join(ROOT, 'takussan-web', 'src', 'components', 'admin', 'super', 'system-health.tsx'), 'utf8');
  const bloc = /const CHECKS\b[^=]*=\s*\[([\s\S]*?)\n\];/.exec(source);
  expect(bloc, 'CHECKS introuvable dans system-health.tsx').not.toBeNull();
  return [...bloc![1].matchAll(/key:\s*'([a-z_]+)'/g)].map((m) => m[1]);
}

function lireMotifs(): string[] {
  const source = readFileSync(join(ROOT, 'takussan-web', 'src', 'types', 'super-admin.ts'), 'utf8');
  const union = /export type HealthReason\s*=([^;]*);/.exec(source);
  expect(union, 'HealthReason introuvable dans super-admin.ts').not.toBeNull();
  return [...union![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

describe('system-health — concordance des sondes avec l’API (TCK-2129)', () => {
  it('le fichier partagé porte les sondes', () => {
    expect(fixture.sondes.length).toBeGreaterThanOrEqual(14);
  });

  it('CHECKS porte une tuile par sonde de l’API, et aucune de plus', () => {
    expect([...lireChecks()].sort()).toEqual([...fixture.sondes].sort());
  });

  it('HealthReason porte chaque motif que l’API émet, et aucun de plus', () => {
    expect(fixture.motifs.length).toBeGreaterThan(0);
    expect([...lireMotifs()].sort()).toEqual([...fixture.motifs].sort());
  });
});
