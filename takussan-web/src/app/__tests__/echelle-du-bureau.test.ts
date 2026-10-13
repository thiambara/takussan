import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * TCK-635 (AC6) — l'échelle du bureau : `html` vaut 90 % de la taille par défaut à partir de
 * `lg` (64rem), et 100 % en dessous.
 *
 * jsdom n'évalue pas les media queries d'une feuille : la règle est lue dans `globals.css`, et la
 * taille réellement calculée (14,4 px à 1440, 16 px à 390) est mesurée au navigateur (notes du
 * ticket).
 */
const css = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');

/** Chaque déclaration `font-size` posée sur `html`, avec la media query qui l'entoure. */
function taillesDeHtml(): { media: string | null; valeur: string }[] {
  const out: { media: string | null; valeur: string }[] = [];
  const re = /(?:@media\s*([^{]+)\{\s*)?html\s*\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const fs = m[2].match(/font-size\s*:\s*([^;]+);/);
    if (fs) out.push({ media: m[1]?.trim() ?? null, valeur: fs[1].trim() });
  }
  return out;
}

describe('TCK-635 — la taille de base du bureau', () => {
  it('90 % à partir de 64rem, et nulle part ailleurs', () => {
    expect(taillesDeHtml()).toEqual([{ media: '(min-width: 64rem)', valeur: '90%' }]);
  });

  it('le seuil est celui de `lg`, où la barre de navigation passe en bureau', () => {
    // Tailwind 4 : `--breakpoint-lg` vaut 64rem par défaut ; aucun thème du dépôt ne le redéfinit.
    expect(css).not.toMatch(/--breakpoint-lg\s*:/);
  });
});
