import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { ORIGINE_SITE, alternatesLangues } from '../alternates';
import { LOCALES } from '@/i18n/config';
import { estCheminLocalisable } from '@/i18n/routing';
import { PAGES_STATIQUES_INDEXABLES, ROUTES_DYNAMIQUES_PUBLIQUES } from '../sitemap';

/**
 * AC3 — la page rend un `hreflang` par langue déclarée indexable, plus `x-default`, et **les URL
 * pointées répondent 200**.
 *
 * Cette seconde moitié est ce qui rend l'AC exigeant, et elle ne se vérifie pas en relisant la
 * fonction : le dernier test descend jusqu'au proxy et au routeur de fichiers. Un `hreflang` vers
 * une URL que le proxy redirigerait, ou vers un chemin qu'aucune route ne sert, fait rougir.
 */
/**
 * Les pages publiques INDEXABLES — **dérivées, plus écrites à la main.**
 *
 * ⚠️ La liste était figée à cinq chemins. Une SIXIÈME page publique indexable n'aurait donc
 * jamais été vue par ce fichier : elle pouvait entrer dans `PAGES_STATIQUES_INDEXABLES` — donc au
 * sitemap, avec ses trois `<loc>` et ses quatre `xhtml:link` — **sans émettre ni canonique ni
 * `hreflang`**. Le sitemap aurait alors déclaré trois versions linguistiques que la page ne
 * reconnaît pas.
 *
 * La dérivation vient des DEUX tables que `sitemap-couverture.test.ts` confronte déjà à
 * l'arborescence, dans les deux sens :
 *
 * · `PAGES_STATIQUES_INDEXABLES` — les pages statiques du sitemap ;
 * · `ROUTES_DYNAMIQUES_PUBLIQUES` — les fiches, tranchées une par une.
 *
 * ⚠ Elle NE se dérive PAS d'un balayage de `robots:` sur les sources : `properties/[slug]`
 * déclare `robots: { index: false }` dans sa seule branche « bien indisponible », et un balayage
 * textuel la classerait `noindex` alors qu'elle est la page indexable la plus importante du site.
 * *Une indexabilité CONDITIONNELLE ne se lit pas dans le texte d'un fichier.*
 */
function fichierDeRoute(chemin: string): string {
  const racine = 'src/app/[locale]/(public)';
  const dossier = chemin === '/' ? '' : chemin;
  const candidats = [
    join(racine, dossier, 'page.tsx'),
    // `/properties` est servie sous un groupe de route `(liste)`, invisible dans l'URL.
    join(racine, dossier, '(liste)', 'page.tsx'),
  ];
  const trouve = candidats.find((c) => existsSync(c));
  if (!trouve) throw new Error(`aucune page.tsx pour « ${chemin} » (essayé : ${candidats.join(', ')})`);
  return trouve;
}

const PAGES_PUBLIQUES = [
  ...PAGES_STATIQUES_INDEXABLES.map((p) => fichierDeRoute(p.chemin)),
  ...Object.keys(ROUTES_DYNAMIQUES_PUBLIQUES).map(fichierDeRoute),
].sort();

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
    for (const route of PAGES_PUBLIQUES) {
      expect(existsSync(route), route).toBe(true);
    }
  });

  it('chaque page publique qui déclare des alternatives passe un chemin SANS langue', async () => {
    // Le piège que la fabrique ne peut pas voir seule : lui passer `'/fr/properties'` rendrait
    // trois URL correctes… et ferait dire à `hreflang="en"` une URL qui n'est pas celle de la
    // page. On garde donc la forme de l'argument au POINT D'APPEL.
    //
    // ⚠ Le point d'appel a changé avec TCK-433 : les cinq pages appellent désormais
    // `alternatesPubliques(chemin, locale)` — la canonique et les `hreflang` se dérivent du même
    // chemin, sans quoi ils se contrediraient. Le scan suit les deux noms : `alternatesLangues`
    // reste la fabrique des seuls `hreflang`, et rien n'interdit qu'une page la reprenne.
    const { readFileSync } = await import('node:fs');
    const FABRIQUE = /alternates(?:Langues|Publiques)\(\s*([`'"])([^`'"]*)\1/g;
    const sources = PAGES_PUBLIQUES.map((f) => [f, readFileSync(f, 'utf8')] as const);

    // Toutes déclarent des alternatives — sans ce compte, une page qui perdrait son appel
    // laisserait la boucle ci-dessous verte sur zéro occurrence.
    for (const [fichier, source] of sources) {
      expect(source.includes('alternatesPubliques('), fichier).toBe(true);
    }

    const appels = sources.flatMap(([, source]) => [...source.matchAll(FABRIQUE)]);

    // Un littéral de MOINS que de pages : `/properties` passe un chemin CALCULÉ
    // (`cheminCanoniqueDeLaListe`), que ce scan ne peut pas lire. Il est éprouvé pour ce qu'il
    // rend, dans `src/app/[locale]/(public)/properties/(liste)/__tests__/metadata.test.ts`.
    expect(appels.length).toBe(PAGES_PUBLIQUES.length - 1);
    for (const [, , chemin] of appels) {
      expect(chemin!.startsWith('/'), chemin).toBe(true);
      expect(estCheminLocalisable(chemin!.replace(/\$\{[^}]*\}/g, 'x')), chemin).toBe(true);
      expect(/^\/(fr|en|wo)(\/|$)/.test(chemin!), chemin).toBe(false);
    }
  });
});

describe('« entre au sitemap » implique « déclare des alternatives »', () => {
  it('le balayage voit un nombre plausible de pages indexables', () => {
    // Sans ce plancher, un glob cassé rendrait l'assertion suivante verte sur zéro page.
    expect(PAGES_PUBLIQUES.length).toBeGreaterThanOrEqual(5);
  });

  it('chaque page STATIQUE du sitemap appelle `alternatesPubliques`', () => {
    /*
     * Le lien qui manquait entre les deux tickets : rien n'obligeait une page entrée dans
     * `PAGES_STATIQUES_INDEXABLES` à émettre canonique et `hreflang`. Le sitemap aurait déclaré
     * pour elle trois `<loc>` et quatre `xhtml:link` que la page elle-même ne reconnaît pas.
     */
    for (const page of PAGES_STATIQUES_INDEXABLES) {
      const fichier = fichierDeRoute(page.chemin);
      expect(
        readFileSync(fichier, 'utf8').includes('alternatesPubliques('),
        `« ${page.chemin} » entre au sitemap sans déclarer d'alternatives (${fichier})`,
      ).toBe(true);
    }
  });
});
