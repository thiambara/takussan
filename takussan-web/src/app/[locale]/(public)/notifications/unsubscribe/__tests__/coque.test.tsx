import { afterEach, beforeEach, describe, it, vi } from 'vitest';

/**
 * TCK-2514 (AC4) — la PAGE `/[locale]/notifications/unsubscribe` rendue elle-même, dans les layouts de ses segments (pas un composant que le test envelopperait) vit dans la coque
 * de lien nue : ni `Navbar`, ni `NavbarSpacer`, ni `Footer` de la marketplace, ni recherche, favoris ou comparateur,
 * et son chemin efface la barre d'onglets et le dock du comparateur. Les trois pièces de la marketplace sont
 * remplacées par des témoins : une page qui les remonterait les montrerait.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/fr/notifications/unsubscribe',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/components/home/Navbar', async () => ({
  Navbar: (await import('@/components/lien-public/__tests__/coque-de-page')).TEMOINS_MARKETPLACE.Navbar,
}));
vi.mock('@/components/home/NavbarSpacer', async () => ({
  NavbarSpacer: (await import('@/components/lien-public/__tests__/coque-de-page')).TEMOINS_MARKETPLACE.NavbarSpacer,
}));
vi.mock('@/components/home/Footer', async () => ({
  Footer: (await import('@/components/lien-public/__tests__/coque-de-page')).TEMOINS_MARKETPLACE.Footer,
}));

import { assertCoqueDeLienNue, pageDansSesLayouts } from '@/components/lien-public/__tests__/coque-de-page';
import Layout from '../../layout';
import Page from '../page';

describe('/[locale]/notifications/unsubscribe — la coque de lien nue', () => {
  beforeEach(() => {
    // La lecture du lien reste en vol : seule l'enveloppe de la page est jugée ici.
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(() => {})));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('ni Navbar, ni Footer de la marketplace, ni dock, ni barre d’onglets', async () => {
    assertCoqueDeLienNue(await pageDansSesLayouts('notifications/unsubscribe', await Page({ searchParams: Promise.resolve({ user: '42', expires: '1893456000', signature: 'b'.repeat(64) }) }), { 'notifications/layout.tsx': Layout }), '/fr/notifications/unsubscribe');
  });
});
