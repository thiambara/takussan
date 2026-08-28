import { describe, expect, it } from 'vitest';

import { ORIGINE_SITE, alternatesLangues } from '../alternates';
import { LOCALES } from '@/i18n/config';
import { estCheminLocalisable } from '@/i18n/routing';

/**
 * AC3 — la page rend un `hreflang` par langue déclarée indexable, plus `x-default`, et **les URL
 * pointées répondent 200**.
 *
 * Cette seconde moitié est ce qui rend l'AC exigeant, et elle ne se vérifie pas en relisant la
 * fonction : le dernier test descend jusqu'au proxy et au routeur de fichiers. Un `hreflang` vers
 * une URL que le proxy redirigerait, ou vers un chemin qu'aucune route ne sert, fait rougir.
 */
describe('alternatesLangues', () => {
  it('déclare les trois langues, plus x-default', () => {
    const { languages } = alternatesLangues('/properties/mon-slug');
    expect(Object.keys(languages!).sort()).toEqual(['en', 'fr', 'wo', 'x-default']);
  });

  it('donne à chaque langue SON URL, distincte des autres', () => {
    const { languages } = alternatesLangues('/properties/mon-slug');
    expect(languages!.fr).toBe(`${ORIGINE_SITE}/fr/properties/mon-slug`);
    expect(languages!.en).toBe(`${ORIGINE_SITE}/en/properties/mon-slug`);
    expect(languages!.wo).toBe(`${ORIGINE_SITE}/wo/properties/mon-slug`);
    expect(new Set(LOCALES.map((l) => languages![l])).size).toBe(3);
  });

  it('x-default pointe vers le français', () => {
    const { languages } = alternatesLangues('/');
    expect(languages!['x-default']).toBe(`${ORIGINE_SITE}/fr`);
  });

  it('rend des URL ABSOLUES — sans `metadataBase`, Next replierait sur localhost', () => {
    const { languages } = alternatesLangues('/agencies/immo-dakar');
    for (const url of Object.values(languages!)) {
      expect(String(url)).toMatch(/^https:\/\//);
    }
  });

  it('l’accueil ne produit pas de double barre', () => {
    const { languages } = alternatesLangues('/');
    expect(languages!.en).toBe(`${ORIGINE_SITE}/en`);
    expect(String(languages!.en)).not.toContain('//en');
  });

  it('rend le MÊME résultat qu’on lui passe le chemin nu ou déjà préfixé', () => {
    // Mesuré, et c'est un contrat utile plutôt qu'un hasard : `cheminLocalise` REMPLACE un préfixe
    // existant. Un sitemap (TCK-431) qui itère sur des URL déjà construites peut donc les repasser
    // ici sans les dépréfixer. Verrouillé pour que l'appelant puisse s'y fier.
    const nu = alternatesLangues('/properties/x').languages!;
    expect(alternatesLangues('/fr/properties/x').languages).toEqual(nu);
    expect(alternatesLangues('/wo/properties/x').languages).toEqual(nu);
  });

  it('refuse un chemin de surface non localisée plutôt que d’inventer trois URL fausses', () => {
    expect(() => alternatesLangues('/app/overview')).toThrow();
    expect(() => alternatesLangues('/api/me/profiles')).toThrow();
  });
});

describe('AC3 (seconde moitié) — les URL pointées sont servies', () => {
  it('aucune alternative n’est redirigée par le proxy', async () => {
    // Un `hreflang` vers une URL qui redirige est un `hreflang` cassé pour les moteurs. On le
    // vérifie sur la RÈGLE qui décide des redirections, pas sur une relecture de la chaîne.
    const { languages } = alternatesLangues('/properties/mon-slug');
    const { proxy } = await import('@/proxy');
    const { NextRequest } = await import('next/server');
    for (const url of Object.values(languages!)) {
      const reponse = proxy(new NextRequest(new URL(String(url))));
      expect(reponse.status, String(url)).toBe(200);
      expect(reponse.headers.get('location'), String(url)).toBeNull();
    }
  });

  it('le chemin déclaré correspond à une route réellement présente sous [locale]', async () => {
    const { existsSync } = await import('node:fs');
    // La forme des trois URL est `/<langue>/properties/<slug>` : la route qui les sert est
    // `src/app/[locale]/(public)/properties/[slug]/page.tsx`. Si le groupe public remontait d'un
    // cran, ce test rougirait — et c'est exactement la régression qui rendrait le hreflang menteur.
    for (const route of [
      'src/app/[locale]/(public)/page.tsx',
      'src/app/[locale]/(public)/properties/(liste)/page.tsx',
      'src/app/[locale]/(public)/properties/[slug]/page.tsx',
      'src/app/[locale]/(public)/agencies/[slug]/page.tsx',
      'src/app/[locale]/(public)/agents/[slug]/page.tsx',
    ]) {
      expect(existsSync(route), route).toBe(true);
    }
  });

  it('chaque page publique qui déclare des alternatives passe un chemin SANS langue', async () => {
    // Le piège que `alternatesLangues` ne peut pas voir seule : `alternatesLangues('/fr/properties')`
    // rendrait trois URL correctes… et ferait dire à `hreflang="en"` une URL qui n'est pas celle de
    // la page. On garde donc la forme de l'argument au point d'appel.
    const { readFileSync } = await import('node:fs');
    const appels = [
      'src/app/[locale]/(public)/page.tsx',
      'src/app/[locale]/(public)/properties/(liste)/page.tsx',
      'src/app/[locale]/(public)/properties/[slug]/page.tsx',
      'src/app/[locale]/(public)/agencies/[slug]/page.tsx',
      'src/app/[locale]/(public)/agents/[slug]/page.tsx',
    ].flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/alternatesLangues\(([`'"])([^`'"]*)\1\)/g)]);

    expect(appels.length).toBe(5);
    for (const [, , chemin] of appels) {
      expect(chemin!.startsWith('/'), chemin).toBe(true);
      expect(estCheminLocalisable(chemin!.replace(/\$\{[^}]*\}/g, 'x')), chemin).toBe(true);
      expect(/^\/(fr|en|wo)(\/|$)/.test(chemin!), chemin).toBe(false);
    }
  });
});
