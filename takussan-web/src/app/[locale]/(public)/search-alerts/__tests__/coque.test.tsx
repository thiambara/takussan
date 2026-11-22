import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * TCK-2514 (AC4) — les deux pages des liens d'alerte vivent dans la coque de lien NUE : ni la
 * recherche, ni les favoris, ni le comparateur, ni la navigation de la marketplace. La carte porte
 * le seul `<h1>` de la page (la page n'en pose plus un second au-dessus).
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/fr/search-alerts/unsubscribe',
}));
vi.mock('next-intl/server', async () => ({
  getTranslations: async () => (cle: string) => cle,
  // Le layout de la section lit son différentiel de dictionnaire (`messagesPour`).
  getMessages: async () => (await import('@/messages/fr.json')).default,
}));

import fr from '@/messages/fr.json';
import { pageDansSesLayouts } from '@/components/lien-public/__tests__/coque-de-page';
import { withIntl } from '@/test/intl';
import ConfirmPage from '../confirm/page';
import Layout from '../layout';
import UnsubscribePage from '../unsubscribe/page';

const SIGNATURE = 'b'.repeat(64);

describe('pages des liens d’alerte — la coque de lien (TCK-2514)', () => {
  it.each([
    ['search-alerts/confirm', async () => ConfirmPage({ searchParams: Promise.resolve({ token: '../x' }) })],
    [
      'search-alerts/unsubscribe',
      async () => UnsubscribePage({ searchParams: Promise.resolve({ search: '42', expires: '1791000000', signature: SIGNATURE }) }),
    ],
  ])('%s : coque nue, un seul titre — dans les layouts de ses segments', async (dossier, rendre) => {
    const { container } = render(
      withIntl(await pageDansSesLayouts(dossier, await rendre(), { 'search-alerts/layout.tsx': Layout })),
    );

    expect(container.querySelector('[data-coque-lien]')).not.toBeNull();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByRole('search')).toBeNull();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    const hrefs = screen.queryAllByRole('link').map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.filter((h) => /favorites|compare/.test(h))).toEqual([]);
  });

  it('la désinscription d’un compte garde son titre « cette alerte »', async () => {
    render(
      withIntl(
        await UnsubscribePage({ searchParams: Promise.resolve({ search: '42', expires: '1791000000', signature: SIGNATURE }) }),
      ),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(fr.search.alertPages.unsubscribe.title);
  });
});
