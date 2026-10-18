// @vitest-environment node
/**
 * TCK-915 (P09.08) — le layout public ne déclare pas `robots`.
 *
 * `index, follow` est la valeur par défaut d'un moteur. Déclarée ici, elle s'ajoutait au `noindex`
 * que Next pose sur une page `notFound()` : la page introuvable d'une fiche portait les deux.
 * Une page qui ne doit pas être indexée le déclare elle-même (`playground`, liste vide…).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', async () => ({
  ...(await import('@/test/intl')).mockTraductionsServeur(),
  setRequestLocale: () => undefined,
}));

describe('layout public — aucune clé `robots` (TCK-915)', () => {
  it.each(['fr', 'en', 'wo'])('en %s', async (locale) => {
    const { generateMetadata } = await import('../layout');
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(meta).not.toHaveProperty('robots');
  });
});
