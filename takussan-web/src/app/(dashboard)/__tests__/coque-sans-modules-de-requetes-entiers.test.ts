import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { modulesDuGrapheClient } from '@/test/graphe-client';

/**
 * TCK-1042 (P70.07) — **la coque de `/app` n'embarque pas un module de requêtes entier pour un
 * seul crochet.**
 *
 * Mesuré le 2026-10-20 (angle 70) : `lib/queries/leases.ts` (42 exports) et
 * `lib/queries/conversations.ts` (37 exports), deux modules `'use client'`, entraient dans le JS
 * initial de chaque écran de `/app` pour `useActiveLeaseSummaries` (modale de bienvenue du
 * locataire) et `useConversations` (pastille de la messagerie). Le bundler n'élague pas leurs
 * exports inutilisés : le JS de `/app/overview`, qui n'a pas de JS propre, portait les chaînes
 * `generate-schedule`, `signature/otp`, `deposit-refund`… Les deux crochets vivent désormais dans
 * leur propre fichier, que l'ancien module réexporte.
 */
const COQUE = [
  join(RACINE_SRC, 'app', '(dashboard)', 'layout.tsx'),
  join(RACINE_SRC, 'app', '(dashboard)', 'app', 'layout.tsx'),
];

const MODULES_ENTIERS = ['lib/queries/leases.ts', 'lib/queries/conversations.ts'];

describe('la coque de /app sans module de requêtes entier', () => {
  it.each(COQUE)('%s', (entree) => {
    const modules = modulesDuGrapheClient(entree);
    expect(modules.size).toBeGreaterThan(20);
    expect(MODULES_ENTIERS.filter((m) => modules.has(m))).toEqual([]);
  });
});
