import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * TCK-742 (P33.01) — **le layout racine ne déclare que les polices qu'une page lit hors de
 * `/playground`.**
 *
 * Une famille `next/font/google` déclarée au layout racine est PRÉCHARGÉE par toutes les routes de
 * l'application (`next-font-manifest.json`). Mesuré le 2026-10-15 : 139 routes préchargeaient les
 * mêmes 7 woff2 (257 Kio), dont 180 Kio pour Geist (lue nulle part), Manrope, Inter et Fraunces
 * (lues par le seul `/playground`). Rien ne casse quand une famille perd son dernier lecteur :
 * seul ce test le voit.
 *
 * Une famille est LUE quand un fichier de `src/`, hors du layout racine, du playground et des
 * tests, contient sa variable (`var(--font-…)`) ou son nom entre guillemets (`"DM Sans"`, comme
 * `globals.css`).
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LAYOUT = join(SRC, 'app', 'layout.tsx');
const PAGE_PLAYGROUND = join(SRC, 'app', '[locale]', '(public)', 'playground', 'page.tsx');

interface Famille {
  readonly nom: string;
  readonly variable: string;
}

/** Les familles `next/font/google` d'un module : nom (`DM_Sans` → `DM Sans`) et variable. */
function famillesDeclarees(source: string): Famille[] {
  const importation = source.match(/import\s*\{([^}]*)\}\s*from\s*'next\/font\/google'/);
  if (!importation) return [];
  return importation[1]
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((fonction) => {
      const appel = source.match(new RegExp(`\\b${fonction}\\(\\{[^)]*variable:\\s*'(--font-[\\w-]+)'`));
      if (!appel) throw new Error(`${fonction} est importée sans appel lisible portant une variable`);
      return { nom: fonction.replace(/_/g, ' '), variable: appel[1] };
    });
}

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return nom === '__tests__' ? [] : fichiers(chemin);
    return /\.(tsx?|css)$/.test(nom) ? [chemin] : [];
  });
}

const tous = fichiers(SRC);
const estPlayground = (chemin: string) => /[\\/]playground[\\/]/.test(relative(SRC, chemin));

describe('polices du layout racine', () => {
  it('chaque famille déclarée au layout racine est lue hors de /playground', () => {
    const lecteurs = tous
      .filter((c) => c !== LAYOUT && !estPlayground(c))
      .map((c) => readFileSync(c, 'utf8'));

    const familles = famillesDeclarees(readFileSync(LAYOUT, 'utf8'));
    expect(familles.length).toBeGreaterThan(0);

    const sansLecteur = familles
      .filter(
        ({ nom, variable }) =>
          !lecteurs.some(
            (s) => s.includes(`var(${variable})`) || s.includes(`"${nom}"`) || s.includes(`'${nom}'`),
          ),
      )
      .map(({ nom }) => nom);

    expect(sansLecteur).toEqual([]);
  });

  it('chaque variable de police que lit le playground y est déclarée, par lui ou par la racine', () => {
    const declarees = [
      ...famillesDeclarees(readFileSync(LAYOUT, 'utf8')),
      ...famillesDeclarees(readFileSync(PAGE_PLAYGROUND, 'utf8')),
    ].map((f) => f.variable);

    const lues = new Set(
      tous
        .filter(estPlayground)
        .flatMap((c) => [...readFileSync(c, 'utf8').matchAll(/var\((--font-[\w-]+)\)/g)].map((m) => m[1])),
    );

    expect(lues.size).toBeGreaterThan(0);
    expect([...lues].filter((v) => !declarees.includes(v))).toEqual([]);
  });
});
