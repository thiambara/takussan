import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * TCK-743 (P33.02) — **le JS client du layout racine n'importe ni `zod` ni `react-hook-form`.**
 *
 * Ce que le layout racine fait entrer dans le graphe client est téléchargé par TOUTE route,
 * `/auth/login` et les pages légales comprises. Mesuré le 2026-10-17 (angle 33) : le widget de
 * messagerie, invisible au visiteur anonyme, y apportait la messagerie, zod (64 Kio gzip) et
 * react-hook-form, soit 450 → 322 Kio de JS initial sur une page légale quand on le retire.
 *
 * Le test suit les imports STATIQUES depuis `src/app/layout.tsx`, comme le bundler :
 * - un module `'use client'` ouvre le graphe client, et tout ce qu'il importe y entre ;
 * - un module serveur importé par un module serveur n'y entre pas ;
 * - un module `'use server'` importé côté client n'y apporte qu'une référence, pas son code ;
 * - `import type` et `import()` (donc `next/dynamic`) ne sont pas suivis : c'est la frontière
 *   qu'un découpage pose.
 *
 * ⚠ C'est un plancher, pas la mesure : il ne voit pas ce que le bundler ajoute de lui-même. La
 * mesure se fait sur les `entryJSFiles` d'un build (méthode de l'angle 33, P33.05).
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INTERDITS = ['zod', 'react-hook-form', '@hookform/resolvers'];

function directive(source: string): 'client' | 'server' | null {
  const tete = source.replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
  if (/^['"]use client['"]/.test(tete)) return 'client';
  if (/^['"]use server['"]/.test(tete)) return 'server';
  return null;
}

function specificateurs(source: string): string[] {
  const sansTypes = source
    .replace(/\b(?:import|export)\s+type\s+[^;]*?\bfrom\s*['"][^'"]+['"]/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return [
    ...[...sansTypes.matchAll(/^\s*(?:import|export)\s[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
    ...[...sansTypes.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]),
  ];
}

function resoudre(depuis: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(dirname(depuis), spec);
  for (const suffixe of ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx']) {
    const chemin = base + suffixe;
    if (existsSync(chemin) && statSync(chemin).isFile()) return chemin;
  }
  return null;
}

const paquet = (spec: string) =>
  spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

/** Les paquets interdits atteints par le graphe client du module, avec le chemin qui y mène. */
function interditsDuGrapheClient(entree: string): string[] {
  const trouves: string[] = [];
  const vus = new Set<string>();
  const pile: Array<{ fichier: string; client: boolean; chemin: string[] }> = [
    { fichier: entree, client: false, chemin: [] },
  ];
  while (pile.length) {
    const { fichier, client: parent, chemin } = pile.pop()!;
    const source = readFileSync(fichier, 'utf8');
    const d = directive(source);
    if (parent && d === 'server') continue;
    const client = parent || d === 'client';
    const cle = `${client}:${fichier}`;
    if (vus.has(cle)) continue;
    vus.add(cle);
    const ici = [...chemin, relative(SRC, fichier)];
    for (const spec of specificateurs(source)) {
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const cible = resoudre(fichier, spec);
        if (cible && /\.(tsx?|m?js)$/.test(cible)) pile.push({ fichier: cible, client, chemin: ici });
      } else if (client && INTERDITS.includes(paquet(spec))) {
        trouves.push(`${paquet(spec)} ← ${ici.join(' ← ')}`);
      }
    }
  }
  return [...new Set(trouves)].sort();
}

describe('JS initial du layout racine', () => {
  it('le graphe client de src/app/layout.tsx n’atteint ni zod ni react-hook-form', () => {
    expect(interditsDuGrapheClient(join(SRC, 'app', 'layout.tsx'))).toEqual([]);
  });

  it('le traceur voit zod quand un module client l’importe (témoin)', () => {
    // Sans ce témoin, un traceur qui ne suit plus rien rendrait le premier test vert.
    const temoin = interditsDuGrapheClient(join(SRC, 'components', 'messages', 'ChatView.tsx'));
    expect(temoin.some((t) => t.startsWith('react-hook-form'))).toBe(true);
  });
});
