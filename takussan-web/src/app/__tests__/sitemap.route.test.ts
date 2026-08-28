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

/**
 * TCK-436 — les deux annuaires de profils sont devenus des sources du sitemap.
 *
 * ⚠ Les doubler n'est PAS optionnel : sans double, la vraie fonction part chercher l'API, échoue
 * sous jsdom, et chaque cas de ce fichier voit alors DEUX pannes de plus. C'est exactement ce qui
 * est arrivé — le cas « l'échec est ÉCRIT et nomme la source » a compté 3 appels au lieu de 1 —
 * et c'est la démonstration, gratuite, que le `try` par source de `src/app/sitemap.ts` isole bien
 * les défaillances : les sept autres cas sont restés verts avec les deux sources en panne.
 */
const profils = vi.hoisted(() => ({ listerSlugsDeProfils: vi.fn() }));

vi.mock('@/lib/queries/public-profiles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/public-profiles')>()),
  listerSlugsDeProfils: profils.listerSlugsDeProfils,
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
    profils.listerSlugsDeProfils.mockReset();
    profils.listerSlugsDeProfils.mockResolvedValue([]);
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

    it('une source en panne n’emporte pas les AUTRES — TCK-436', async () => {
      // Trois sources, un `try` chacune. Le jour où quelqu'un les regrouperait dans un seul
      // `try`, la panne de l'annuaire d'agents ferait disparaître le catalogue entier du
      // sitemap : *trois sources dans un seul `try` n'en font qu'une.*
      const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
      catalogue.listerBiensDuSitemap.mockResolvedValue([BIEN]);
      profils.listerSlugsDeProfils.mockImplementation(async (ressource: string) => {
        if (ressource === 'agents') throw new Error('index des agents injoignable');
        return ['sahel-homes'];
      });

      const urls = (await jouerSitemap()).map((e) => e.url);

      expect(urls).toContain(`${ORIGINE_SITE}/fr/properties/${BIEN.slug}`);
      expect(urls).toContain(`${ORIGINE_SITE}/fr/agencies/sahel-homes`);
      expect(urls.some((u) => u.includes('/agents/'))).toBe(false);
      // …et l'index `/agents` LUI-MÊME reste là : c'est une page statique, pas une fiche.
      expect(urls).toContain(`${ORIGINE_SITE}/fr/agents`);

      expect(journal).toHaveBeenCalledTimes(1);
      expect(String(journal.mock.calls[0]![0])).toContain('agents');
      journal.mockRestore();
    });
  });
});

describe('TCK-436 · AC6 — les profils éligibles entrent au sitemap', () => {
  beforeEach(() => {
    vi.resetModules();
    catalogue.listerBiensDuSitemap.mockReset();
    catalogue.listerBiensDuSitemap.mockResolvedValue([]);
    profils.listerSlugsDeProfils.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('porte les DEUX index et les fiches des profils, dans les trois langues', async () => {
    profils.listerSlugsDeProfils.mockImplementation(async (ressource: string) =>
      ressource === 'agencies' ? ['sahel-homes'] : ['awa-diop'],
    );

    const urls = (await jouerSitemap()).map((e) => e.url);

    for (const langue of ['fr', 'en', 'wo']) {
      expect(urls).toContain(`${ORIGINE_SITE}/${langue}/agencies`);
      expect(urls).toContain(`${ORIGINE_SITE}/${langue}/agents`);
      expect(urls).toContain(`${ORIGINE_SITE}/${langue}/agencies/sahel-homes`);
      expect(urls).toContain(`${ORIGINE_SITE}/${langue}/agents/awa-diop`);
    }
  });

  it('n’ajoute AUCUNE fiche que la source ne rend pas — l’éligibilité est jugée côté API', async () => {
    // C'est la moitié « et aucune de celles qui ne le sont pas » de l'AC. Le sitemap ne juge rien :
    // il pagine `GET /public/{ressource}`, dont l'exclusion est éprouvée par
    // `PublicProfileIndexTest::test_ac2_*`. Réécrire la condition ici la ferait diverger.
    profils.listerSlugsDeProfils.mockResolvedValue([]);

    const urls = (await jouerSitemap()).map((e) => e.url);

    expect(urls.some((u) => /\/(agencies|agents)\/[^/]/.test(u))).toBe(false);
    // Les deux INDEX restent, eux : ils existent indépendamment de leur contenu.
    expect(urls).toContain(`${ORIGINE_SITE}/fr/agencies`);
  });

  it('encode le slug — un `&` dans un `username` rendrait le XML entier invalide', async () => {
    profils.listerSlugsDeProfils.mockImplementation(async (ressource: string) =>
      ressource === 'agents' ? ['awa&diop'] : [],
    );

    const urls = (await jouerSitemap()).map((e) => e.url);

    expect(urls).toContain(`${ORIGINE_SITE}/fr/agents/awa%26diop`);
    expect(urls.some((u) => u.includes('/agents/awa&diop'))).toBe(false);
  });

  it('n’invente aucun `lastModified` — l’index ne sert pas `updated_at`', async () => {
    profils.listerSlugsDeProfils.mockImplementation(async (ressource: string) =>
      ressource === 'agencies' ? ['sahel-homes'] : [],
    );

    const fiche = (await jouerSitemap()).find((e) => e.url.endsWith('/fr/agencies/sahel-homes'))!;

    expect(fiche).toBeDefined();
    expect(Object.hasOwn(fiche, 'lastModified')).toBe(false);
  });

  it('chaque entrée de profil déclare les trois `hreflang`', async () => {
    profils.listerSlugsDeProfils.mockImplementation(async (ressource: string) =>
      ressource === 'agents' ? ['awa-diop'] : [],
    );

    const fiche = (await jouerSitemap()).find((e) => e.url.endsWith('/en/agents/awa-diop'))!;

    expect(fiche.alternates?.languages).toMatchObject({
      fr: `${ORIGINE_SITE}/fr/agents/awa-diop`,
      en: `${ORIGINE_SITE}/en/agents/awa-diop`,
      wo: `${ORIGINE_SITE}/wo/agents/awa-diop`,
    });
  });
});
