import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { compile } from 'tailwindcss';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Revue design 2026-09-16 — le plancher tactile mobile des primitives RELÈVE, il ne RABOTE jamais.
 *
 * La première version posait `max-sm:min-h-10` : même spécificité qu'un `min-h-14` d'appelant,
 * émise plus tard, et `twMerge` ne voit aucun conflit entre les deux. Sous 640 px, le plancher
 * GAGNAIT — `ContactSheet` passait de 56 à 40 px (relecture adverse, F1). Le plancher vit
 * désormais dans `@layer components` ; ce fichier garde les deux moitiés de la propriété :
 * les primitives portent la classe de couche (et plus l'utilitaire), et la feuille COMPILÉE
 * range cette classe sous les utilitaires.
 */

const GLOBALS = path.join(process.cwd(), 'src/app/globals.css');

async function blocDuPlancher(): Promise<string> {
  const source = await fs.readFile(GLOBALS, 'utf8');
  const debut = source.indexOf('/* plancher-tactile:début');
  const fin = source.indexOf('/* plancher-tactile:fin */');
  expect(debut, 'marqueur de début absent de globals.css').toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(debut);
  return source.slice(debut, fin);
}

/** Compile le Tailwind DU DÉPÔT avec le bloc du plancher, sur une liste de candidats. */
async function feuille(candidats: readonly string[]): Promise<string> {
  const compilateur = await compile(`@import "tailwindcss";\n${await blocDuPlancher()}`, {
    base: process.cwd(),
    loadStylesheet: async () => {
      const p = path.join(process.cwd(), 'node_modules/tailwindcss/index.css');
      return { path: p, base: path.dirname(p), content: await fs.readFile(p, 'utf8') };
    },
  });
  return compilateur.build([...candidats]);
}

/** La couche du bloc `@layer x {` qui contient `selecteur` (les blocs ne s'imbriquent pas ici). */
function coucheDe(css: string, selecteur: string): string | null {
  const i = css.indexOf(selecteur);
  if (i < 0) return null;
  const ouvertures = [...css.slice(0, i).matchAll(/@layer\s+([\w-]+)\s*\{/g)];
  return ouvertures.at(-1)?.[1] ?? null;
}

describe('les primitives portent le plancher de COUCHE, pas un utilitaire', () => {
  it('Button garde le min-h de l’appelant ET le plancher, sans variante max-sm', () => {
    render(<Button size="lg" className="min-h-14">Appeler</Button>);
    const bouton = screen.getByRole('button', { name: 'Appeler' });
    const classes = bouton.className.split(' ');
    expect(classes).toContain('min-h-14');
    expect(classes).toContain('plancher-tactile-10');
    expect(bouton.className).not.toMatch(/max-sm:min-/);
  });

  it('les tailles sm et icône prennent leur propre plancher', () => {
    render(
      <>
        <Button size="sm">Petit</Button>
        <Button size="icon" aria-label="Icône" />
        <Button size="xs">Mini</Button>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Petit' }).className).toContain('plancher-tactile-9');
    expect(screen.getByRole('button', { name: 'Icône' }).className).toContain('plancher-tactile-carre-10');
    // `xs` reste compact, délibérément.
    expect(screen.getByRole('button', { name: 'Mini' }).className).not.toContain('plancher-tactile');
  });

  it('Input et SelectTrigger aussi', () => {
    render(
      <>
        <Input aria-label="champ" />
        <Select>
          <SelectTrigger aria-label="liste" size="sm">
            <SelectValue />
          </SelectTrigger>
        </Select>
      </>,
    );
    expect(screen.getByLabelText('champ').className).toContain('plancher-tactile-10');
    expect(screen.getByLabelText('liste').className).toContain('plancher-tactile-9');
    expect(screen.getByLabelText('liste').className).not.toMatch(/max-sm:/);
  });
});

describe('la feuille compilée range le plancher SOUS les utilitaires', () => {
  it('ordre des couches : components avant utilities, plancher dans components', async () => {
    const css = await feuille(['min-h-14', 'min-h-10']);

    // L'ordre des couches est DÉCLARÉ par Tailwind en tête de feuille ; c'est lui qui tranche,
    // pas l'ordre d'apparition des blocs (le bloc `components` est émis APRÈS `utilities`).
    expect(css).toMatch(/@layer\s+theme,\s*base,\s*components,\s*utilities;/);

    expect(coucheDe(css, '.plancher-tactile-10')).toBe('components');
    expect(coucheDe(css, '.plancher-onglets-liste')).toBe('components');
    // Le `min-h-14` d'appelant est dans `utilities` : il gagne, quelle que soit la spécificité.
    expect(coucheDe(css, '.min-h-14')).toBe('utilities');
    // Le plancher ne vaut que sous `sm`.
    const plancher = css.indexOf('.plancher-tactile-10');
    expect(css.slice(css.lastIndexOf('@layer components', plancher), plancher)).toMatch(
      /@media\s*\(width\s*<\s*40rem\)/,
    );
  });

  it('non-vacuité : l’ancienne forme vivait dans la MÊME couche que l’appelant, et après lui', async () => {
    const css = await feuille(['min-h-14', 'max-sm:min-h-10']);
    expect(coucheDe(css, '.max-sm\\:min-h-10')).toBe('utilities');
    expect(coucheDe(css, '.min-h-14')).toBe('utilities');
    expect(css.indexOf('.max-sm\\:min-h-10')).toBeGreaterThan(css.indexOf('.min-h-14'));
  });
});
