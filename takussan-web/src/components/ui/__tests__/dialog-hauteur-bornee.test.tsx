import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { compile } from 'tailwindcss';
import fs from 'node:fs';
import path from 'node:path';

import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { withIntl } from '@/test/intl';

/**
 * TCK-674 (piste P08.02) — un dialogue plus haut que l'écran doit défiler en lui-même.
 *
 * La primitive est centrée en `fixed top-1/2 -translate-y-1/2` et le verrou de défilement de
 * Base UI fige le document : sans hauteur bornée, le titre et le bouton d'envoi d'un dialogue
 * long (celui de la visite, sur un 360×640) sortent de l'écran et rien ne permet d'y aller.
 *
 * jsdom ne calcule aucune mise en page : le test lit donc le CSS que Tailwind COMPILE pour les
 * classes que porte réellement le dialogue rendu, avec la classe d'un appelant réel
 * (`PropertyVisitDialog` : `sm:max-w-lg`) pour garder aussi la fusion par `cn()`.
 */

const RACINE = process.cwd();

async function cssCompile(classes: string[]): Promise<string> {
  const compilateur = await compile('@import "tailwindcss";', {
    base: RACINE,
    loadStylesheet: async () => {
      const p = path.join(RACINE, 'node_modules/tailwindcss/index.css');
      return { path: p, base: path.dirname(p), content: fs.readFileSync(p, 'utf8') };
    },
  });
  const css = compilateur.build(classes);
  return css.slice(css.indexOf('@layer utilities'));
}

describe('DialogContent — hauteur bornée à l’écran', () => {
  it('borne la hauteur à la fenêtre et fait défiler le contenu', async () => {
    render(
      withIntl(
        <Dialog open>
          <DialogContent className="sm:max-w-lg">
            <DialogTitle>Demander une visite</DialogTitle>
          </DialogContent>
        </Dialog>,
      ),
    );
    await screen.findByText('Demander une visite');
    const popup = document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
    expect(popup).not.toBeNull();

    const css = await cssCompile(popup!.className.split(/\s+/));
    expect(css, 'aucune hauteur maximale compilée').toMatch(/max-height\s*:\s*calc\(100dvh - 2rem\)/);
    expect(css, 'aucun défilement vertical compilé').toMatch(/overflow-y\s*:\s*auto/);
  });
});
