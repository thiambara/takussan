import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { compile } from 'tailwindcss';
import fs from 'node:fs/promises';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { Calendar } from '@/components/ui/calendar';

/**
 * TCK-582 · **le calendrier rendu à la charte.**
 *
 * Relevé au navigateur le 2026-09-26, avant correctif : jour sélectionné sans fond et cerclé de
 * `rgb(0, 0, 255)`, cases de 42 px, chevrons remplis de bleu, jour courant en bleu. Cause :
 * `ui/calendar.tsx` importait `react-day-picker/style.css` depuis le JS, donc HORS de toute
 * couche cascade — et une déclaration hors couche bat toute déclaration en couche, quelle que
 * soit sa spécificité. Tous les utilitaires Tailwind 4 de `calendar.tsx` perdaient.
 *
 * ⚠ jsdom n'a pas de moteur CSS : « le jour est terracotta » n'y est pas éprouvable. Ce qui l'est,
 * et qui porte la correction : (1) plus aucun import JS de la feuille, (2) la ligne de
 * `globals.css` qui la charge, compilée par le Tailwind du dépôt, range CHACUNE de ses règles dans
 * une couche placée avant `utilities`, (3) les classes que le calendrier pose réellement dans le
 * DOM produisent l'accent sur `--primary` et des chevrons sans remplissage.
 */

const RACINE = process.cwd();
const sansCommentaires = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * La TÊTE de `globals.css` — ses déclarations d'ordre `@layer …;` et ses `@import …;`, dans
 * l'ordre écrit, jusqu'à la première autre règle. C'est elle qu'on compile, et non la seule ligne
 * de react-day-picker : une couche nommée ne se range sous `utilities` que si son ordre est
 * déclaré AVANT celui que `@import "tailwindcss"` pose — compiler la ligne seule serait vert sur
 * une feuille qui, servie, battrait tous les utilitaires.
 */
function teteDeGlobals(): string {
  const css = sansCommentaires(readFileSync(path.join(RACINE, 'src/app/globals.css'), 'utf8'));
  const tete: string[] = [];
  for (const instruction of css.split(';')) {
    const t = instruction.trim();
    if (!/^@(import|layer)\s[^{]*$/.test(t)) break;
    tete.push(`${t};`);
  }
  return tete.join('\n');
}

/** La ligne `@import "react-day-picker/style.css" …;` de la tête, telle qu'écrite. */
function ligneDImport(): string | null {
  return teteDeGlobals().match(/@import\s+["']react-day-picker\/style\.css["'][^;]*;/)?.[0] ?? null;
}

/** Résout `paquet/chemin` par la condition `style` de ses `exports`, comme Tailwind le fait. */
function resoudre(id: string): string {
  if (id === 'tailwindcss') return path.join(RACINE, 'node_modules/tailwindcss/index.css');
  const morceaux = id.split('/');
  const paquet = id.startsWith('@') ? morceaux.slice(0, 2).join('/') : morceaux[0];
  const sous = id.slice(paquet.length + 1);
  const dossier = path.join(RACINE, 'node_modules', paquet);
  const manifeste = JSON.parse(readFileSync(path.join(dossier, 'package.json'), 'utf8'));
  let cible: unknown = manifeste.exports?.[sous ? `./${sous}` : '.'] ?? (sous ? undefined : manifeste.style);
  while (cible && typeof cible === 'object') {
    const c = cible as Record<string, unknown>;
    cible = c.style ?? c.default;
  }
  return path.join(dossier, typeof cible === 'string' ? cible : sous);
}

/** Compile la tête de `globals.css` avec le Tailwind du dépôt, sur une liste de candidats. */
async function feuille(candidats: readonly string[]): Promise<string> {
  const compilateur = await compile(teteDeGlobals(), {
    base: RACINE,
    loadStylesheet: async (id) => {
      const p = resoudre(id);
      return { path: p, base: path.dirname(p), content: await fs.readFile(p, 'utf8') };
    },
  });
  return compilateur.build([...candidats]);
}

/**
 * Chaque règle de premier niveau de la sortie, avec la couche qui l'enveloppe (`null` = hors
 * couche). Accolades équilibrées ; la sortie de Tailwind ne porte pas d'accolade dans ses chaînes.
 */
function reglesParCouche(css: string): { couche: string | null; selecteur: string; corps: string }[] {
  const regles: { couche: string | null; selecteur: string; corps: string }[] = [];
  const pile: string[] = [];
  let debut = 0;
  let profondeurDeRegle = -1;
  let selecteurCourant = '';
  let corpsDebut = 0;
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (c === ';' && profondeurDeRegle === -1) debut = i + 1;
    else if (c === '{') {
      const entete = css.slice(debut, i).trim();
      pile.push(entete);
      if (profondeurDeRegle === -1 && !entete.startsWith('@')) {
        profondeurDeRegle = pile.length;
        selecteurCourant = entete;
        corpsDebut = i + 1;
      }
      debut = i + 1;
    } else if (c === '}') {
      if (pile.length === profondeurDeRegle) {
        const couches = pile.slice(0, -1).filter((e) => e.startsWith('@layer'));
        regles.push({
          couche: couches.length ? couches[0].replace('@layer', '').trim() : null,
          selecteur: selecteurCourant,
          corps: css.slice(corpsDebut, i),
        });
        profondeurDeRegle = -1;
      }
      pile.pop();
      debut = i + 1;
    }
  }
  return regles;
}

function fichiersSource(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const p = path.join(dossier, nom);
    if (statSync(p).isDirectory()) return nom === '__tests__' ? [] : fichiersSource(p);
    return /\.(ts|tsx)$/.test(nom) ? [p] : [];
  });
}

describe('la feuille de react-day-picker passe sous les utilitaires', () => {
  it('aucun module ne l’importe depuis le JS — un import JS la remet hors couche', () => {
    const importeurs = fichiersSource(path.join(RACINE, 'src'))
      .filter((f) => /import\s+["']react-day-picker\/style\.css["']/.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(RACINE, f));
    expect(importeurs).toEqual([]);
  });

  it('globals.css la charge, et CHACUNE de ses règles tombe dans une couche avant `utilities`', async () => {
    expect(ligneDImport(), 'la tête de globals.css doit importer react-day-picker/style.css').not.toBeNull();

    const css = await feuille([]);
    // Le rang d'une couche est celui de sa PREMIÈRE apparition, en énoncé (`@layer a, b;`) comme
    // en bloc (`@layer a {`) — la règle de CSS Cascade 5, et la raison d'être de l'énoncé d'ordre
    // qui précède `@import "tailwindcss"` dans globals.css.
    const ordre: string[] = [];
    for (const m of css.matchAll(/@layer\s+([\w\s,.-]+?)\s*[;{]/g)) {
      for (const nom of m[1].split(',').map((n) => n.trim())) if (!ordre.includes(nom)) ordre.push(nom);
    }
    expect(ordre).toContain('utilities');

    const rdp = reglesParCouche(css).filter((r) => r.selecteur.includes('.rdp-'));
    // Plancher : la feuille est bien là (elle porte la grille et les états d'accessibilité).
    expect(rdp.map((r) => r.selecteur)).toEqual(
      expect.arrayContaining(['.rdp-day_button', '.rdp-chevron', '.rdp-selected .rdp-day_button']),
    );
    const horsCouche = rdp.filter((r) => r.couche === null).map((r) => r.selecteur);
    expect(horsCouche).toEqual([]);
    const auDessus = rdp
      .filter((r) => ordre.indexOf(r.couche!) < 0 || ordre.indexOf(r.couche!) >= ordre.indexOf('utilities'))
      .map((r) => `${r.couche} → ${r.selecteur}`);
    expect(auDessus).toEqual([]);
  });

  it('dans une couche À ELLE, jamais dans une couche que Tailwind nomme', () => {
    // Mesuré le 2026-09-26 sous Next 16.3.1 (Turbopack) : `@import "react-day-picker/style.css"
    // layer(components);` compile ici, passe `@tailwindcss/postcss` seul… et SORT du CSS servi —
    // zéro règle `.rdp-`, sans erreur ni avertissement. `layer(rdp)`, même fichier, est servi.
    // Ce test ne fait pas tourner Turbopack : il interdit la forme dont on a mesuré la perte.
    const couche = ligneDImport()?.match(/layer\(([^)]+)\)/)?.[1].trim();
    expect(couche).toBeDefined();
    expect(['theme', 'base', 'components', 'utilities']).not.toContain(couche);
  });
});

describe('ce que le calendrier pose réellement dans le DOM', () => {
  const rendu = () =>
    render(<Calendar mode="single" selected={new Date(2026, 8, 12)} month={new Date(2026, 8, 1)} />);
  const utilitaires = (css: string) =>
    reglesParCouche(css).filter((r) => r.couche === 'utilities').map((r) => r.corps).join('\n');

  it('l’accent de la bibliothèque est le jeton `--primary`, jamais une couleur écrite', async () => {
    const { container } = rendu();
    const racine = container.querySelector('.rdp-root');
    expect(racine).not.toBeNull();
    const css = utilitaires(await feuille([...racine!.classList]));
    expect(css).toMatch(/--rdp-accent-color:\s*var\(--primary\)/);
  });

  it('les chevrons ne sont pas remplis — un Lucide se dessine au trait', async () => {
    const { container } = rendu();
    const chevrons = container.querySelectorAll('svg.rdp-chevron');
    expect(chevrons.length).toBe(2);
    for (const chevron of chevrons) {
      const css = utilitaires(await feuille([...chevron.classList]));
      expect(css).toMatch(/fill:\s*none/);
    }
  });
});
