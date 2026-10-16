import { describe, expect, it } from 'vitest';

import nextConfig from '../../../next.config';

/**
 * TCK-673 (P08.01) — sans `serverActions.bodySizeLimit`, Next refuse tout corps de server action
 * au-delà de 1 Mo (`next/dist/server/app-render/action-handler.js`, 413 « Body exceeded 1 MB »),
 * multipart compris. Une seule photo réduite pèse déjà 1,4 Mo (TCK-542) : aucune ne passait.
 *
 * 12 Mo : une photo par action (10 Mo au plus, `MediaManager`) plus l'enveloppe multipart.
 */
describe('next.config.ts — taille du corps des server actions', () => {
  it('relève le plafond de 1 Mo à 12 Mo', () => {
    expect(nextConfig.experimental?.serverActions?.bodySizeLimit).toBe('12mb');
  });
});
