import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ORIGINE_SITE } from '@/lib/alternates';
import type { BienDuSitemap } from '@/lib/queries/sitemap-catalogue';

/**
 * TCK-431 · AC1 — **`/sitemap.xml` porte l'URL d'un bien publié, en absolu, sur l'hôte configuré.**
 *
 * L'AC exige que le test vérifie *par le contenu* : « une réponse 200 portant un sitemap vide le
 * cocherait aussi ». C'est donc la SORTIE de la route qu'on inspecte, avec un catalogue simulé —
 * l'alternative (démarrer un `next start` et un Laravel) ne dirait rien de plus et ne tiendrait
 * pas dans une suite unitaire.
 *
 * `vi.resetModules()` à chaque cas : le module de route est importé dynamiquement APRÈS que le
 * double soit posé, faute de quoi il capturerait la vraie fonction.
 */
const catalogue = vi.hoisted(() => ({ listerBiensDuSitemap: vi.fn() }));

vi.mock('@/lib/queries/sitemap-catalogue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/sitemap-catalogue')>()),
  listerBiensDuSitemap: catalogue.listerBiensDuSitemap,
}));

async function jouerSitemap() {
  const route = await import('../sitemap');
  return route.default();
}

const BIEN: BienDuSitemap = {
  slug: 'villa-piscine-a-ngor-7Xk2Lm',
  updated_at: '2026-08-25T09:12:00+00:00',
};

describe('/sitemap.xml', () => {
  beforeEach(() => {
    vi.resetModules();
    catalogue.listerBiensDuSitemap.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('porte l’URL d’un bien publié, absolue, sur l’hôte configuré, dans les trois langues', async () => {
    catalogue.listerBiensDuSitemap.mockResolvedValue([BIEN]);

    const urls = (await jouerSitemap()).map((e) => e.url);

    expect(urls).toContain(`${ORIGINE_SITE}/fr/properties/${BIEN.slug}`);
    expect(urls).toContain(`${ORIGINE_SITE}/en/properties/${BIEN.slug}`);
    expect(urls).toContain(`${ORIGINE_SITE}/wo/properties/${BIEN.slug}`);
  });

  it('porte aussi l’accueil et la liste, préfixés', async () => {
    catalogue.listerBiensDuSitemap.mockResolvedValue([]);

    const urls = (await jouerSitemap()).map((e) => e.url);

    expect(urls).toContain(`${ORIGINE_SITE}/fr`);
    expect(urls).toContain(`${ORIGINE_SITE}/en/properties`);
  });

  it('reporte `updated_at` en `lastModified`', async () => {
    catalogue.listerBiensDuSitemap.mockResolvedValue([BIEN]);

    const fiche = (await jouerSitemap()).find((e) =>
      e.url.endsWith(`/fr/properties/${BIEN.slug}`),
    );

    expect(fiche?.lastModified).toBe(BIEN.updated_at);
  });

  it('un bien sans `updated_at` n’émet PAS de <lastmod> vide', async () => {
    catalogue.listerBiensDuSitemap.mockResolvedValue([{ slug: 'sans-date', updated_at: null }]);

    const fiche = (await jouerSitemap()).find((e) => e.url.endsWith('/fr/properties/sans-date'))!;

    expect(Object.hasOwn(fiche, 'lastModified')).toBe(false);
  });

  it('aucune URL relative, aucune URL portant « undefined »', async () => {
    catalogue.listerBiensDuSitemap.mockResolvedValue([BIEN]);

    for (const entree of await jouerSitemap()) {
      expect(entree.url, entree.url).toMatch(/^https?:\/\//);
      expect(entree.url, entree.url).not.toContain('undefined');
    }
  });

  it('n’expose AUCUN écran personnel ni le POC de design', async () => {
    catalogue.listerBiensDuSitemap.mockResolvedValue([BIEN]);

    const urls = (await jouerSitemap()).map((e) => e.url);
    for (const interdit of ['/favorites', '/compare', '/bookings', '/playground']) {
      expect(urls.filter((u) => u.includes(interdit)), interdit).toEqual([]);
    }
  });

  describe('la source `catalogue` est indisponible — D-04 / TCK-288', () => {
    it('rend quand même les pages statiques plutôt que de casser le build du front', async () => {
      const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
      catalogue.listerBiensDuSitemap.mockRejectedValue(new Error('API injoignable'));

      const urls = (await jouerSitemap()).map((e) => e.url);

      expect(urls).toContain(`${ORIGINE_SITE}/fr`);
      expect(urls).toContain(`${ORIGINE_SITE}/fr/properties`);
      expect(urls.some((u) => u.includes('/properties/'))).toBe(false);
      journal.mockRestore();
    });

    it('l’échec est ÉCRIT et nomme la source', async () => {
      // La dégradation est admise ; le silence ne l'est pas. Sans cette ligne, un sitemap amputé
      // du catalogue entier serait indistinguable d'un catalogue vide.
      const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
      catalogue.listerBiensDuSitemap.mockRejectedValue(new Error('API injoignable'));

      await jouerSitemap();

      expect(journal).toHaveBeenCalledTimes(1);
      expect(String(journal.mock.calls[0]![0])).toContain('catalogue');
      journal.mockRestore();
    });
  });
});
