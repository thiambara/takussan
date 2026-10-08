import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PLATFORM_ABILITIES } from '../platform-abilities';

/**
 * TCK-600 — parité des VALEURS de gestes avec `App\Models\Enums\PlatformAbility`. Le test lit le
 * fichier PHP : un geste ajouté au back et oublié ici ne serait filtré par aucun écran.
 */
const ENUM = join(
  dirname(fileURLToPath(import.meta.url)),
  '..', '..', '..', '..',
  'takussan-api', 'app', 'Models', 'Enums', 'PlatformAbility.php',
);

describe('PLATFORM_ABILITIES ↔ PlatformAbility.php', () => {
  it('porte exactement les valeurs de l’enum', () => {
    const valeurs = [...readFileSync(ENUM, 'utf8').matchAll(/\bcase\s+\w+\s*=\s*'([a-z_.]+)'\s*;/g)].map((m) => m[1]);
    expect(valeurs.length).toBeGreaterThan(0);
    expect([...PLATFORM_ABILITIES].sort()).toEqual([...valeurs].sort());
  });
});
