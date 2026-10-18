/**
 * TCK-870 (P07.11) — sous `prefers-reduced-motion: reduce`, les primitives n'animent plus leur
 * ouverture ni leur fermeture, et la rangée de biens ne défile plus en glissant
 * (`docs/design-guidelines.md`, « Animations standard »).
 *
 * Pourquoi `motion-reduce:data-open:animate-none` et non `motion-reduce:animate-none` : sous
 * `shadcn/tailwind.css`, `data-open:animate-in` compile en `.x:where([data-open]…)`, de même
 * spécificité que `.y` sous `@media`, et Tailwind l'émet APRÈS `motion-reduce:animate-none`.
 * C'est l'animation qui gagne. Le troisième cas compile la vraie feuille pour le tenir.
 */
import { readFileSync, readdirSync } from 'node:fs';
import fs from 'node:fs';
import path, { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compile } from 'tailwindcss';
import { fireEvent, render, screen } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { PropertyRow } from '@/components/property/cards/PropertyRow';

const UI = join(__dirname, '..');

const ETATS = [
  { anime: 'data-open:animate-in', neutre: 'motion-reduce:data-open:animate-none' },
  { anime: 'data-closed:animate-out', neutre: 'motion-reduce:data-closed:animate-none' },
] as const;

/** Les littéraux de chaîne d'un source, qui portent les classes. */
function chaines(source: string): string[] {
  return [...source.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
}

async function feuille(classes: string[]): Promise<string> {
  const racine = process.cwd();
  const fichiers: Record<string, string> = {
    tailwindcss: 'node_modules/tailwindcss/index.css',
    'tw-animate-css': 'node_modules/tw-animate-css/dist/tw-animate.css',
    'shadcn/tailwind.css': 'node_modules/shadcn/dist/tailwind.css',
  };
  const compilateur = await compile(
    '@import "tailwindcss";\n@import "tw-animate-css";\n@import "shadcn/tailwind.css";',
    {
      base: racine,
      loadStylesheet: async (id: string) => {
        const p = path.join(racine, fichiers[id]);
        return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
      },
    },
  );
  const css = compilateur.build(classes);
  return css.slice(css.indexOf('@layer utilities'));
}

describe('mouvement réduit (TCK-870)', () => {
  const primitives = readdirSync(UI).filter((f) => f.endsWith('.tsx'));

  it.each(primitives)('ui/%s : chaque animation d’état a sa neutralisation', (fichier) => {
    const fautes = chaines(readFileSync(join(UI, fichier), 'utf8')).flatMap((classes) =>
      ETATS.filter(({ anime, neutre }) => classes.includes(anime) && !classes.includes(neutre)).map(
        ({ anime }) => `${anime} sans neutralisation : ${classes.slice(0, 80)}…`,
      ),
    );
    expect(fautes).toEqual([]);
  });

  it('la neutralisation compilée vient après l’animation, sous le même état', async () => {
    const css = await feuille(ETATS.flatMap(({ anime, neutre }) => [anime, neutre]));
    for (const { anime, neutre } of ETATS) {
      const echappe = (c: string) => `.${c.replace(/:/g, '\\:')} {`;
      const iAnime = css.indexOf(echappe(anime));
      const iNeutre = css.indexOf(echappe(neutre));
      expect(iAnime).toBeGreaterThanOrEqual(0);
      expect(iNeutre).toBeGreaterThan(iAnime);
      const bloc = css.slice(iNeutre, css.indexOf('\n  }\n', iNeutre));
      expect(bloc).toContain('@media (prefers-reduced-motion: reduce)');
      expect(bloc).toContain(':where([data-');
      expect(bloc).toContain('animation: none');
    }
  });

  describe('<PropertyRow> — défilement des flèches', () => {
    const scrollBy = vi.fn();
    const matchMediaInitial = window.matchMedia;

    beforeEach(() => {
      scrollBy.mockReset();
      Object.defineProperty(HTMLElement.prototype, 'scrollBy', { configurable: true, value: scrollBy });
      Object.defineProperty(HTMLElement.prototype, 'scrollWidth', { configurable: true, get: () => 2000 });
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
    });

    afterEach(() => {
      window.matchMedia = matchMediaInitial;
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollBy;
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollWidth;
      delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth;
    });

    function preferer(reduit: boolean) {
      window.matchMedia = ((query: string) => ({
        matches: reduit && query.includes('prefers-reduced-motion: reduce'),
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      })) as typeof window.matchMedia;
    }

    function monter() {
      render(
        withIntl(
          <PropertyRow title="Rangée" variant="standard" properties={[]} loading error={null} />,
        ),
      );
      fireEvent.click(screen.getByRole('button', { name: 'Suivant' }));
    }

    it('glisse quand rien n’est demandé', () => {
      preferer(false);
      monter();
      expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'smooth' }));
    });

    it('saute sans glisser sous mouvement réduit, et la rangée ne lisse plus son défilement', () => {
      preferer(true);
      monter();
      expect(scrollBy).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'instant' }));
      const rangee = document.querySelector('.scroll-smooth');
      expect(rangee?.className).toContain('motion-reduce:scroll-auto');
    });
  });
});
