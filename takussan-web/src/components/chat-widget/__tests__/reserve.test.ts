import { describe, expect, it } from 'vitest';

import {
  CHAT_FAB_MOBILE_HEIGHT_PX,
  CHAT_LAUNCHER_DESKTOP_HEIGHT_PX,
  RESERVE_SOUS_LANCEUR,
} from '../reserve';

/**
 * TCK-644, AC4 — le dernier élément d'une page de `/app` défile au-dessus du lanceur. Le compte
 * se fait contre les valeurs RÉELLES : `--floating-dock-base` (16 / 24 px, `globals.css`), le
 * `py-6 md:py-8` de la coque, et l'échelle Tailwind (1 unité = 4 px).
 */
const BASE_DU_DOCK = { mobile: 16, bureau: 24 };
const COQUE = { mobile: 24, bureau: 32 };

function unites(classe: string | undefined): number {
  const m = /pb-(\d+)$/.exec(classe ?? '');
  if (!m) throw new Error(`classe de rembourrage illisible : ${classe}`);
  return Number(m[1]) * 4;
}

describe('RESERVE_SOUS_LANCEUR (TCK-644, AC4)', () => {
  const [mobile, bureau] = RESERVE_SOUS_LANCEUR.split(' ');

  it('sous md, laisse le dernier élément au-dessus du bouton flottant', () => {
    const sommetDuLanceur = BASE_DU_DOCK.mobile + CHAT_FAB_MOBILE_HEIGHT_PX;
    expect(COQUE.mobile + unites(mobile)).toBeGreaterThanOrEqual(sommetDuLanceur + 12);
  });

  it('dès md, au-dessus du lanceur de bureau', () => {
    expect(bureau.startsWith('md:')).toBe(true);
    const sommetDuLanceur = BASE_DU_DOCK.bureau + CHAT_LAUNCHER_DESKTOP_HEIGHT_PX;
    expect(COQUE.bureau + unites(bureau)).toBeGreaterThanOrEqual(sommetDuLanceur + 12);
  });
});
