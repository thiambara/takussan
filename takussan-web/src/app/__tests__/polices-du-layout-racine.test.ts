import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * TCK-742 (P33.01) — **le layout racine ne déclare que les polices qu'une page lit hors de
 * `/playground`.**
 *
 * Une famille déclarée au layout racine est PRÉCHARGÉE par toutes les routes de
 * l'application (`next-font-manifest.json`). Mesuré le 2026-10-15 : 139 routes préchargeaient les
 * mêmes 7 woff2 (257 Kio), dont 180 Kio pour Geist (lue nulle part), Manrope, Inter et Fraunces
 * (lues par le seul `/playground`). Rien ne casse quand une famille perd son dernier lecteur :
 * seul ce test le voit.
 *
 * Une famille est LUE quand un fichier de `src/`, hors du layout racine, du playground et des
 * tests, contient sa variable (`var(--font-…)`). Depuis ADR-0074, son nom ne compte plus :
 * `next/font/local` nomme la famille d'après la constante JS, et `globals.css` passe par les
 * variables.
 *
 * ADR-0074 — **plus aucun `next/font/google` dans `src/`.** Il téléchargeait les fontes chez
 * Google à chaque `next build`, et ses pannes intermittentes cassaient le build des PR et celui
 * de l'image. Les fichiers sont versionnés sous `src/app/fonts/` ; le dernier test casse au
 * premier import ou double qui reviendrait.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LAYOUT = join(SRC, 'app', 'layout.tsx');
const PAGE_PLAYGROUND = join(SRC, 'app', '[locale]', '(public)', 'playground', 'page.tsx');

interface Famille {
  readonly nom: string;
  readonly variable: string;
  readonly prechargee: boolean;
}

/** Les familles `next/font/local` d'un module : constante (`dmSans`) et variable. */
function famillesDeclarees(source: string): Famille[] {
  if (!/import\s+localFont\s+from\s+'next\/font\/local'/.test(source)) return [];
  const appels = [...source.matchAll(/const\s+(\w+)\s*=\s*localFont\(\{([\s\S]*?)\}\);/g)];
  if (appels.length !== (source.match(/\blocalFont\(/g) ?? []).length) {
    throw new Error('un appel à localFont ne se lit pas sous la forme `const x = localFont({ … });`');
  }
  return appels.map(([, nom, options]) => {
    const variable = options.match(/variable:\s*'(--font-[\w-]+)'/);
    if (!variable) throw new Error(`${nom} est déclarée sans variable lisible`);
    return { nom, variable: variable[1], prechargee: !/preload:\s*false/.test(options) };
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
        ({ variable }) => !lecteurs.some((s) => s.includes(`var(${variable})`)),
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

  it('à la racine, seules les faces latin sont préchargées ; latin-ext se charge à la demande', () => {
    // ADR-0074 — le fichier `latin-ext` (le « ŋ » du wolof) n'est lu que par son `unicode-range` :
    // le précharger le ferait télécharger par toutes les routes, pour quelques pages en wolof.
    const familles = famillesDeclarees(readFileSync(LAYOUT, 'utf8'));
    expect(familles.filter((f) => f.prechargee).map((f) => f.variable)).toEqual([
      '--font-bricolage',
      '--font-dm-sans',
    ]);
  });

  it('aucun fichier de src/ ne charge de police chez Google Fonts (ADR-0074)', () => {
    // Le nom du module est COMPOSÉ, pour que ce fichier ne se dénonce pas lui-même.
    const moduleGoogle = ['next', 'font', 'google'].join('/');
    const tousAvecLesTests = (dossier: string): string[] =>
      readdirSync(dossier).flatMap((nom) => {
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) return tousAvecLesTests(chemin);
        return /\.(m?[jt]sx?|css)$/.test(nom) ? [chemin] : [];
      });

    const fautifs = tousAvecLesTests(SRC)
      .filter((c) => {
        const s = readFileSync(c, 'utf8');
        return s.includes(`'${moduleGoogle}'`) || s.includes(`"${moduleGoogle}"`) || /fonts\.(googleapis|gstatic)\.com/.test(s);
      })
      .map((c) => relative(SRC, c));

    expect(fautifs).toEqual([]);
  });
});
