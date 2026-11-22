import { describe, expect, it, vi } from 'vitest';

/**
 * TCK-2983 — la page du lien d'action porte un secret dans l'URL (le jeton EST le droit d'agir) :
 * `no-referrer`, jamais indexée, et un titre fixe où le jeton n'entre pas.
 */
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (cle: string) => cle,
}));
vi.mock('@/components/lien-d-action/PageDuLienDAction', () => ({ PageDuLienDAction: () => null }));

describe('/fil/a/{jeton} — métadonnées', () => {
  it('no-referrer, jamais indexée, titre fixe', async () => {
    const { generateMetadata } = await import('../page');
    const metadata = await generateMetadata();
    expect(metadata.referrer).toBe('no-referrer');
    expect(metadata.robots).toEqual({ index: false, follow: false });
    expect(metadata.title).toBe('metaTitre');
  });
});
