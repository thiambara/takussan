import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { coutDEntreeTotal, type EntreeCoutDEntree } from '@/lib/cout-d-entree';

/**
 * TCK-633 — concordance avec l'API : `takussan-api/tests/fixtures/cout-d-entree.json` est lu par
 * CE test et par `tests/Unit/Services/Property/CoutDEntreeConcordanceTest.php`. Le total que
 * l'aperçu affiche est, au franc près, celui que la fiche publiée affichera.
 */
interface Cas {
  readonly nom: string;
  readonly entree: EntreeCoutDEntree;
  readonly total: string | null;
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const { cas } = JSON.parse(
  readFileSync(join(ROOT, 'takussan-api', 'tests', 'fixtures', 'cout-d-entree.json'), 'utf8'),
) as { cas: readonly Cas[] };

/** Le formulaire tient des NOMBRES (`FormAmountInput`, `z.coerce`) ; la fixture, des chaînes. */
function enNombres(e: EntreeCoutDEntree): EntreeCoutDEntree {
  const n = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? v : Number(v));
  return {
    ...e,
    price: n(e.price),
    agency_fee_months: n(e.agency_fee_months),
    monthly_charges: n(e.monthly_charges),
  };
}

describe('coutDEntreeTotal — concordance avec CoutDEntree (API)', () => {
  it('la fixture porte des cas des deux sortes', () => {
    expect(cas.length).toBeGreaterThanOrEqual(15);
    expect(cas.some((c) => c.total === null)).toBe(true);
  });

  it.each(cas.map((c) => [c.nom, c] as const))('%s', (_, c) => {
    const attendu = c.total === null ? null : Number(c.total);
    expect(coutDEntreeTotal(c.entree)).toBe(attendu);
    expect(coutDEntreeTotal(enNombres(c.entree))).toBe(attendu);
  });
});
