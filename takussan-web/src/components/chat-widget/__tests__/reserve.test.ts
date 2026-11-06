import { describe, expect, it } from 'vitest';

import { porteLaBarreDOnglets } from '@/components/layout/plein-ecran';
import { CHAT_LAUNCHER_DESKTOP_HEIGHT_PX, RESERVE_SOUS_LANCEUR } from '../reserve';

/**
 * TCK-644, AC4 — le dernier élément d'une page de `/app` défile au-dessus du lanceur. Le compte
 * se fait contre les valeurs RÉELLES : `--floating-dock-base` (16 / 24 px, `globals.css`), le
 * `py-6 md:py-8` de la coque, et l'échelle Tailwind (1 unité = 4 px).
 */
const BASE_DU_DOCK = { bureau: 24 };
const COQUE = { bureau: 32 };

function unites(classe: string | undefined): number {
  const m = /pb-(\d+)$/.exec(classe ?? '');
  if (!m) throw new Error(`classe de rembourrage illisible : ${classe}`);
  return Number(m[1]) * 4;
}

describe('RESERVE_SOUS_LANCEUR (TCK-644, AC4)', () => {
  /**
   * TCK-2481 (revue, M2) — sous `md`, le bouton flottant ne se rend plus sur `/app` : la barre
   * d'onglets porte « Messagerie », et la coque réserve déjà sa hauteur (le `<main>` rétrécit). La
   * réserve ne vaut donc que là où le lanceur est rendu — dès `md`. Elle laissait 56 px vides.
   */
  it('sous md, aucune réserve : sur /app le bouton flottant n’est pas rendu', () => {
    expect(porteLaBarreDOnglets('/app/properties')).toBe(true);
    expect(RESERVE_SOUS_LANCEUR.split(' ').filter((c) => !c.startsWith('md:'))).toEqual([]);
  });

  it('dès md, au-dessus du lanceur de bureau', () => {
    const bureau = RESERVE_SOUS_LANCEUR.split(' ').find((c) => c.startsWith('md:'));
    const sommetDuLanceur = BASE_DU_DOCK.bureau + CHAT_LAUNCHER_DESKTOP_HEIGHT_PX;
    expect(COQUE.bureau + unites(bureau)).toBeGreaterThanOrEqual(sommetDuLanceur + 12);
  });
});
