import React, { useEffect, useRef } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';

import { ToastProvider, Toaster, useToast } from '@/components/ui/toast';

/**
 * Un toast est la couche du DESSUS — rien de ce que le produit empile ne doit le recouvrir.
 *
 * TCK-561, vérification adverse : rien ne gardait l'empilement du viewport des toasts, et il
 * valait `z-[100]` quand le dépôt empile jusqu'à 1100 (listes de `Select`, `Popover`, menus,
 * combobox — `components/ui/popover.tsx`, `select.tsx`, `dropdown-menu.tsx`) et que Leaflet pose
 * ses calques jusqu'à 1000 (`leaflet.css`, importé par `globals.css`) — dans le contexte racine
 * dès qu'un conteneur de carte n'est pas isolé. Un avis levé pendant qu'une liste ou un menu est
 * ouvert en haut à droite se retrouvait DESSOUS.
 *
 * Ce que le test mesure : l'index COMPILÉ par Tailwind pour les classes que porte réellement le
 * viewport rendu, contre le plus grand index écrit dans `src/` (hors tests et hors ce composant)
 * et dans la feuille de Leaflet. Un ajout futur au-dessus du toast fait rougir, en nommant
 * le fichier.
 */

const RACINE = process.cwd();

function fichiers(dir: string, acc: string[] = []): string[] {
  for (const entree of fs.readdirSync(dir)) {
    const chemin = path.join(dir, entree);
    if (fs.statSync(chemin).isDirectory()) {
      if (entree === '__tests__' || entree === 'node_modules') continue;
      fichiers(chemin, acc);
    } else if (/\.(tsx?|css)$/.test(entree) && !/\.(test|spec)\./.test(entree)) acc.push(chemin);
  }
  return acc;
}

/** Tous les index d'empilement écrits en classes Tailwind ou en CSS, avec leur fichier. */
function indexEcrits(): { fichier: string; z: number }[] {
  const out: { fichier: string; z: number }[] = [];
  const TOAST = path.join(RACINE, 'src/components/ui/toast.tsx');
  for (const fichier of fichiers(path.join(RACINE, 'src'))) {
    if (fichier === TOAST) continue;
    const source = fs.readFileSync(fichier, 'utf8');
    for (const m of source.matchAll(/(?<![\w-])z-(?:\[(\d+)\]|(\d+))(?![\w-])/g)) {
      out.push({ fichier: path.relative(RACINE, fichier), z: Number(m[1] ?? m[2]) });
    }
    for (const m of source.matchAll(/z-index\s*:\s*(\d+)/g)) {
      out.push({ fichier: path.relative(RACINE, fichier), z: Number(m[1]) });
    }
  }
  const leaflet = fs.readFileSync(path.join(RACINE, 'node_modules/leaflet/dist/leaflet.css'), 'utf8');
  for (const m of leaflet.matchAll(/z-index\s*:\s*(\d+)/g)) out.push({ fichier: 'leaflet.css', z: Number(m[1]) });
  return out;
}

async function zCompile(classes: string[]): Promise<number[]> {
  const compilateur = await compile('@import "tailwindcss";', {
    base: RACINE,
    loadStylesheet: async () => {
      const p = path.join(RACINE, 'node_modules/tailwindcss/index.css');
      return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
    },
  });
  const css = compilateur.build(classes);
  const couche = css.slice(css.indexOf('@layer utilities'));
  return [...couche.matchAll(/z-index\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
}

function Declencheur() {
  const toast = useToast();
  const emis = useRef(false);
  useEffect(() => {
    if (emis.current) return;
    emis.current = true;
    toast.add({ title: 'avis', type: 'warning' });
  }, [toast]);
  return null;
}

describe('toast — au premier plan', () => {
  it('non-vacuité : le relevé voit les couches hautes du dépôt', () => {
    const releve = indexEcrits();
    expect(releve.some((r) => r.fichier.endsWith('popover.tsx') && r.z >= 1000)).toBe(true);
    expect(releve.some((r) => r.fichier === 'leaflet.css' && r.z === 1000)).toBe(true);
  });

  it('le viewport des toasts est au-dessus de tout ce que le dépôt empile', async () => {
    render(
      <NextIntlClientProvider locale="fr" messages={{ ui: { toast: { close: 'Fermer' } } }}>
        <ToastProvider>
          <Declencheur />
          <Toaster />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    await screen.findByText('avis');
    const viewport = document.querySelector<HTMLElement>('[data-slot="toaster"]');
    expect(viewport).not.toBeNull();

    const z = await zCompile(viewport!.className.split(/\s+/));
    expect(z, 'aucun z-index compilé sur le viewport').toHaveLength(1);

    const plusHaut = indexEcrits().reduce((a, b) => (b.z > a.z ? b : a));
    expect(z[0], `${plusHaut.fichier} empile à ${plusHaut.z}`).toBeGreaterThan(plusHaut.z);
  });
});

/** Longueur en px d'une valeur compilée `calc(var(--spacing) * N)` ou `Npx` (`--spacing` = 0,25 rem). */
function px(valeur: string): number {
  const calc = valeur.match(/^calc\(var\(--spacing\)\s*\*\s*(-?[\d.]+)\)$/);
  if (calc) return Number(calc[1]) * 4;
  const brut = valeur.match(/^(-?[\d.]+)px$/);
  if (brut) return Number(brut[1]);
  throw new Error(`longueur illisible : ${valeur}`);
}

async function valeurCompilee(classe: string, propriete: string): Promise<string | null> {
  const compilateur = await compile('@import "tailwindcss";', {
    base: RACINE,
    loadStylesheet: async () => {
      const p = path.join(RACINE, 'node_modules/tailwindcss/index.css');
      return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
    },
  });
  const css = compilateur.build([classe]);
  const couche = css.slice(css.indexOf('@layer utilities'));
  return couche.match(new RegExp(`(?<![\\w-])${propriete}\\s*:\\s*([^;]+);`))?.[1].trim() ?? null;
}

describe('toast — la croix se touche', () => {
  it('zone d’appui de la croix ≥ 44 px : taille dessinée + débord du pseudo-élément', async () => {
    render(
      <NextIntlClientProvider locale="fr" messages={{ ui: { toast: { close: 'Fermer' } } }}>
        <ToastProvider>
          <Declencheur />
          <Toaster />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    await screen.findByText('avis');
    const croix = document.querySelector<HTMLElement>('[data-slot="toaster"] button[aria-label="Fermer"]');
    expect(croix, 'croix introuvable').not.toBeNull();
    const classes = croix!.className.split(/\s+/);

    const taille = classes.find((c) => /^size-/.test(c));
    expect(taille, 'aucune taille sur la croix').toBeDefined();
    const cote = px((await valeurCompilee(taille!, 'width'))!);

    const debord = classes.find((c) => /^after:-inset-/.test(c));
    const retrait = debord ? -px((await valeurCompilee(debord, 'inset'))!) : 0;
    expect(classes).toEqual(expect.arrayContaining(['after:absolute']));
    expect(cote + 2 * retrait, `${cote} px + 2 × ${retrait} px`).toBeGreaterThanOrEqual(44);
  });
});
