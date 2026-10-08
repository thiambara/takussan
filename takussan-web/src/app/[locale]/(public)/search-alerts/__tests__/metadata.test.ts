import { describe, expect, it, vi } from 'vitest';

/**
 * TCK-599 (verif-599 m8) — les deux pages des liens d'alerte portent un secret dans l'URL : le
 * jeton de confirmation, ou le jeton et la signature de désinscription. `no-referrer` empêche le
 * navigateur de le porter, dans un `Referer`, vers chaque lien sortant de la page ; `index: false`
 * l'écarte des moteurs. Une régression sur l'un ou l'autre ne casse aucun écran : elle ne se voit
 * qu'ici.
 */

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (cle: string) => cle,
}));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/NavbarSpacer', () => ({ NavbarSpacer: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/search-alerts/SearchAlertLinkAction', () => ({
  SearchAlertLinkAction: () => null,
}));

const PAGES = {
  '/search-alerts/confirm': () => import('../confirm/page'),
  '/search-alerts/unsubscribe': () => import('../unsubscribe/page'),
};

describe('pages des liens d’alerte — métadonnées', () => {
  for (const [chemin, charger] of Object.entries(PAGES)) {
    it(`${chemin} : no-referrer et jamais indexée`, async () => {
      const { generateMetadata } = await charger();
      const metadata = await generateMetadata();

      expect(metadata.referrer).toBe('no-referrer');
      expect(metadata.robots).toEqual({ index: false, follow: false });
    });
  }
});
