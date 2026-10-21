import { describe, expect, it, vi } from 'vitest';

/**
 * P97.06 (TCK-1183) — la page de désabonnement du résumé porte la signature dans l'URL :
 * `no-referrer` empêche le navigateur de la porter, dans un `Referer`, vers chaque lien sortant de
 * la page ; `index: false` l'écarte des moteurs.
 */

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (cle: string) => cle,
}));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/notifications/DigestUnsubscribeAction', () => ({
  DigestUnsubscribeAction: () => null,
}));

describe('/notifications/unsubscribe — métadonnées', () => {
  it('no-referrer et jamais indexée', async () => {
    const { generateMetadata } = await import('../unsubscribe/page');
    const metadata = await generateMetadata();

    expect(metadata.referrer).toBe('no-referrer');
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
