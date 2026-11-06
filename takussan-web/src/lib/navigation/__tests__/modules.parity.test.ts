import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CODES_DE_MODULE } from '../modules';

/**
 * TCK-2483 — parité des codes de module entre le front et `App\Models\Enums\AgencyModule`, qui VALIDE
 * `settings.hidden_modules`. Un code seulement au front serait refusé en 422 à l'enregistrement ; un
 * code seulement à l'API se masquerait sans rien retirer.
 *
 * `.github/workflows/web-ci.yml` se déclenche sur l'enum : les deux côtés qu'une garde compare
 * doivent la réveiller.
 *
 * ⚠ CE QU'IL NE PROUVE PAS : que la table code → destinations soit juste (c'est `modules.test.ts`).
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const ENUM = join(ROOT, 'takussan-api', 'app', 'Models', 'Enums', 'AgencyModule.php');

function codesDuBack(): string[] {
  const php = readFileSync(ENUM, 'utf8');
  expect(php, `enum AgencyModule introuvable dans ${ENUM}`).toContain('enum AgencyModule: string');
  const codes = [...php.matchAll(/case\s+\w+\s*=\s*'([a-z_]+)';/g)].map((m) => m[1]);
  expect(codes.length, 'aucun cas extrait d’AgencyModule — la garde n’aurait rien vérifié').toBeGreaterThan(0);
  return codes;
}

describe('parité CODES_DE_MODULE ↔ App\\Models\\Enums\\AgencyModule', () => {
  it('le front déclare exactement les modules que l’API accepte, dans le même ordre', () => {
    expect([...CODES_DE_MODULE]).toEqual(codesDuBack());
  });
});
