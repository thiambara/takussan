import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { AdminModerationItem } from '@/types/super-admin';
import { ModerationStats } from '../moderation';

/**
 * P199.02 (TCK-2165) — les tuiles « Biens » et « Avis » comptaient les lignes de la page de 20,
 * à côté du total de toute la file, titré « Total page ». Elles lisent désormais les comptes par
 * type que l'API calcule sur la file filtrée (`meta.counts`), et la première tuile s'appelle
 * « Total ».
 */

function element(id: string, type: 'property' | 'review'): AdminModerationItem {
  return { id, type, age_minutes: 60 } as AdminModerationItem;
}

/** Le texte de la tuile qui porte ce libellé : l'enfant de la grille qui le contient. */
function tuile(libelle: string): string | null {
  let noeud: HTMLElement | null = screen.getByText(libelle);
  while (noeud?.parentElement && !noeud.parentElement.className.includes('grid')) {
    noeud = noeud.parentElement;
  }
  return noeud?.textContent ?? null;
}

describe('ModerationStats', () => {
  it('rend les comptes par type de la file entière, pas ceux de la page', () => {
    render(
      withIntl(
        <ModerationStats
          items={[element('property:1', 'property'), element('review:2', 'review')]}
          total={25}
          counts={{ property: 18, review: 7 }}
        />,
      ),
    );

    expect(tuile('Total')).toContain('25');
    expect(tuile('Biens')).toContain('18');
    expect(tuile('Avis')).toContain('7');
    expect(screen.queryByText('Total page')).toBeNull();
  });
});
