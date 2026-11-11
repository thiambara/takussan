/**
 * TCK-2587 (lot B, réponse 6 du team-lead) — le geste secondaire compact de `BarreDAction` : une prop
 * explicite, le 50/50 reste le défaut. La largeur réelle ne se mesure pas sous jsdom ; la règle CSS
 * émise est gardée par `check:classes-emises`, et le relevé de la fiche la mesure au navigateur.
 */
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
