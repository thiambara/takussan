/**
 * TCK-2587 (lot B, réponse 6 du team-lead) — le geste secondaire compact de `BarreDAction` : une prop
 * explicite, le 50/50 reste le défaut. La largeur réelle ne se mesure pas sous jsdom ; la règle CSS
 * émise est gardée par `check:classes-emises`, et le relevé de la fiche la mesure au navigateur.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { Button } from '@/components/ui/button';
import { BarreDAction } from '@/components/ui/barre-d-action';

const barre = () => document.querySelector('[data-slot="barre-d-action"]') as HTMLElement;
const classes = () => barre().className.split(/\s+/);

describe('BarreDAction — le geste secondaire compact (TCK-2587)', () => {
  it('par défaut : 50/50, aucun geste resserré', () => {
    render(
      <BarreDAction>
        <Button>A</Button>
        <Button>B</Button>
      </BarreDAction>,
    );
    expect(classes()).toContain('*:flex-1');
    expect(barre().className).not.toMatch(/:(first|last):/);
    expect(barre()).not.toHaveAttribute('data-secondaire');
  });

  it('`secondaire="premier"` resserre le premier geste, et seulement s’il n’est pas seul', () => {
    render(
      <BarreDAction secondaire="premier">
        <Button>Absent</Button>
        <Button>Terminer la visite</Button>
      </BarreDAction>,
    );
    expect(classes()).toEqual(expect.arrayContaining(['*:flex-1', '*:first:not-last:flex-none']));
    expect(classes()).not.toContain('*:last:not-first:flex-none');
    expect(barre()).toHaveAttribute('data-secondaire', 'premier');
  });

  it('`secondaire="dernier"` resserre le dernier geste, et seulement s’il n’est pas seul', () => {
    render(
      <BarreDAction secondaire="dernier">
        <Button>Je suis en route</Button>
        <Button>Commencer</Button>
      </BarreDAction>,
    );
    expect(classes()).toEqual(expect.arrayContaining(['*:flex-1', '*:last:not-first:flex-none']));
    expect(classes()).not.toContain('*:first:not-last:flex-none');
    expect(barre()).toHaveAttribute('data-secondaire', 'dernier');
  });
});

describe('BarreDAction — `taille="action"`, des boutons de 48 px (TCK-2587, complément du team-lead)', () => {
  const css = readFileSync(join(__dirname, '../../../app/globals.css'), 'utf8');

  it('par défaut : aucune taille posée, les boutons gardent la leur (44 px)', () => {
    render(
      <BarreDAction>
        <Button>A</Button>
      </BarreDAction>,
    );
    expect(barre()).not.toHaveAttribute('data-taille');
  });

  it('`taille="action"` se pose sur la barre, et la feuille y redéfinit la hauteur des boutons et celle de la barre', () => {
    render(
      <BarreDAction taille="action">
        <Button>Confirmer</Button>
      </BarreDAction>,
    );
    expect(barre()).toHaveAttribute('data-taille', 'action');
    // Les enfants (`h-controle`) prennent la hauteur de l'action principale : 48 px.
    expect(css).toMatch(/\[data-slot="barre-d-action"\]\[data-taille="action"\] \{\s*--spacing-controle: var\(--spacing-controle-action\);/);
    // La barre en mesure 73 : le toast et le dock se posent au-dessus d'elle, pas dessus.
    expect(css).toMatch(
      /:root:has\(#emplacement-barre-d-action > \[data-slot="barre-d-action"\]\[data-taille="action"\]\) \{\s*--barre-d-action-hauteur: calc\(var\(--spacing-controle-action\) \+ var\(--spacing\) \* 6 \+ 1px\);/,
    );
    expect(css).toMatch(
      /:root:has\(#emplacement-barre-d-action\[data-bas-de-l-ecran\] > \[data-slot="barre-d-action"\]\[data-taille="action"\]\) \{\s*--barre-d-action-hauteur: calc\(var\(--spacing-controle-action\) \+ var\(--spacing\) \* 6 \+ 1px \+ env\(safe-area-inset-bottom\)\);/,
    );
  });
});
