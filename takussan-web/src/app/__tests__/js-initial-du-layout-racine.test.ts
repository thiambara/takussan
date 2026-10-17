import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { RACINE_SRC } from '@/test/analyse-statique';
import { paquetsDuGrapheClient } from '@/test/graphe-client';

/**
 * TCK-743 (P33.02) — **le JS client du layout racine n'importe ni `zod` ni `react-hook-form`.**
 *
 * Ce que le layout racine fait entrer dans le graphe client est téléchargé par TOUTE route,
 * `/auth/login` et les pages légales comprises. Mesuré le 2026-10-17 (angle 33) : le widget de
 * messagerie, invisible au visiteur anonyme, y apportait la messagerie, zod (64 Kio gzip) et
 * react-hook-form, soit 450 → 322 Kio de JS initial sur une page légale quand on le retire.
 * Le traceur et ses limites : `src/test/graphe-client.ts`.
 */
const INTERDITS = ['zod', 'react-hook-form', '@hookform/resolvers'];

describe('JS initial du layout racine', () => {
  it('le graphe client de src/app/layout.tsx n’atteint ni zod ni react-hook-form', () => {
    expect(paquetsDuGrapheClient(join(RACINE_SRC, 'app', 'layout.tsx'), INTERDITS)).toEqual([]);
  });

  it('le traceur voit react-hook-form quand un module client l’importe (témoin)', () => {
    // Sans ce témoin, un traceur qui ne suit plus rien rendrait le premier test vert.
    const temoin = paquetsDuGrapheClient(join(RACINE_SRC, 'components', 'messages', 'ChatView.tsx'), INTERDITS);
    expect(temoin.some((t) => t.startsWith('react-hook-form'))).toBe(true);
  });
});
