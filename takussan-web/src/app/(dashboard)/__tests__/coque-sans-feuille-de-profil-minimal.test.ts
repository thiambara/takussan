import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { modulesDuGrapheClient } from '@/test/graphe-client';

/**
 * TCK-1089 (P70.05) — **la coque de `/app` ne charge pas la feuille de profil minimal avant son
 * ouverture.**
 *
 * Mesuré le 2026-10-20 (angle 70) : `CustomerMinimalProfileSheet`, rendu pour un compte `customer`
 * seul et à la demande, était importé statiquement par `MinimalProfileTriggerProvider`, et
 * apportait seul `@base-ui/react/select` à chaque écran de `/app`. Il passe par `next/dynamic`,
 * rendu dès sa première ouverture (`useDejaOuvert`).
 *
 * `TotpEnrollment` reste importé statiquement, par décision du porteur : le dialogue qui bloque
 * l'accès tant que la double authentification n'est pas enrôlée ne dépend pas du réseau.
 */
const COQUE = [
  join(RACINE_SRC, 'app', '(dashboard)', 'layout.tsx'),
  join(RACINE_SRC, 'app', '(dashboard)', 'app', 'layout.tsx'),
];

const DIFFERES = ['components/customer/CustomerMinimalProfileSheet.tsx', 'components/ui/select.tsx'];

describe('la coque de /app sans la feuille de profil minimal', () => {
  it.each(COQUE)('%s', (entree) => {
    const modules = modulesDuGrapheClient(entree);
    expect(modules.size).toBeGreaterThan(20);
    expect(DIFFERES.filter((m) => modules.has(m))).toEqual([]);
  });

  it('le dialogue de double authentification reste dans la coque', () => {
    const modules = modulesDuGrapheClient(COQUE[0]!);
    expect([...modules].filter((m) => m.includes('TotpEnrollment')).length).toBeGreaterThan(0);
  });
});
