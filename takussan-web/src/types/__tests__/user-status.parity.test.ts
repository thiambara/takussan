import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { USER_STATUSES } from '../user';

/**
 * Garde de PARITÉ front ↔ back sur le STATUT d'un compte (P115.02, TCK-1287).
 *
 * Le front typait `'active' | 'inactive' | 'banned'`, l'API écrit `blocked` au blocage
 * (`UserLifecycleController`) et `deleted` à l'effacement : le filtre « Bloqué » de la console
 * d'équipe envoyait `filter[status]=banned` et rendait toujours une liste vide. `banned` venait
 * d'un second enum PHP sans appelant (`App\Models\Bases\Enums\UserStatus`), retiré avec ce test.
 *
 * ⚠ CE QU'IL NE PROUVE PAS : que chaque écran propose toutes les valeurs, ni qu'un libellé soit
 * juste. Il tient l'accord entre deux listes ; le typage (`UserStatus`) tient ensuite les options.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const ENUM = join(ROOT, 'takussan-api', 'app', 'Models', 'Enums', 'UserStatus.php');

function statutsDuBack(): string[] {
  const php = readFileSync(ENUM, 'utf8');
  expect(php, `enum UserStatus introuvable dans ${ENUM}`).toContain('enum UserStatus: string');

  const statuts = [...php.matchAll(/case\s+\w+\s*=\s*'([a-z_]+)';/g)].map((m) => m[1]);
  expect(statuts.length, 'aucun cas extrait de UserStatus — la garde n’aurait rien vérifié').toBeGreaterThan(0);

  return statuts;
}

describe('parité UserStatus ↔ App\\Models\\Enums\\UserStatus', () => {
  it('le front déclare exactement les statuts que l’API connaît', () => {
    expect([...USER_STATUSES].sort()).toEqual(statutsDuBack().sort());
  });

  it('ne connaît plus `banned`, que l’API n’écrit jamais', () => {
    expect(USER_STATUSES).not.toContain('banned');
  });
});
