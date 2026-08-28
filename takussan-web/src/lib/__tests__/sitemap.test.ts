import { describe, expect, it } from 'vitest';

import { ORIGINE_SITE } from '../alternates';
import {
  CHEMINS_INTERDITS_AUX_ROBOTS,
  LIMITE_URL_PAR_SITEMAP,
  PAGES_STATIQUES_INDEXABLES,
  absolu,
  cheminDeFiche,
  construireSitemap,
  entreesLocalisees,
} from '../sitemap';
import { LOCALES } from '@/i18n/config';

/** Le `<loc>` que Next écrira, pour une entrée donnée. */
const urls = (entrees: ReturnType<typeof construireSitemap>) => entrees.map((e) => e.url);

describe('entreesLocalisees — TCK-431 · AC1', () => {
  it('rend UNE entrée par langue, et non une entrée à trois alternatives', () => {
    // Une seule entrée portant trois `xhtml:link` laisserait deux des trois URL hors du sitemap :
    // les alternatives DÉCRIVENT, elles ne déclarent pas.
    const entrees = entreesLocalisees({ chemin: '/properties/villa-dakar' });
    expect(entrees).toHaveLength(LOCALES.length);
    expect(urls(entrees)).toEqual([
      `${ORIGINE_SITE}/fr/properties/villa-dakar`,
      `${ORIGINE_SITE}/en/properties/villa-dakar`,
      `${ORIGINE_SITE}/wo/properties/villa-dakar`,
    ]);
  });

  it('chaque entrée déclare les TROIS alternatives plus x-default', () => {
    for (const entree of entreesLocalisees({ chemin: '/properties/villa-dakar' })) {
      expect(Object.keys(entree.alternates!.languages!).sort()).toEqual([
        'en',
        'fr',
        'wo',
        'x-default',
      ]);
    }
  });

  it('aucune URL sans préfixe de langue — TCK-434 a déplacé toute la surface publique', () => {
    const toutes = urls(construireSitemap([...PAGES_STATIQUES_INDEXABLES]));
    expect(toutes.length).toBeGreaterThan(0);
    for (const url of toutes) {
      // `/properties` nu rend 307 : une URL non préfixée dans un sitemap est une redirection
      // annoncée comme canonique.
      expect(url, url).toMatch(new RegExp(`^${ORIGINE_SITE}/(fr|en|wo)(/|$)`));
    }
  });

  it('l’accueil ne produit pas de double barre', () => {
    expect(urls(entreesLocalisees({ chemin: '/' }))).toEqual([
      `${ORIGINE_SITE}/fr`,
      `${ORIGINE_SITE}/en`,
      `${ORIGINE_SITE}/wo`,
    ]);
  });

  it('reporte lastModified, changeFrequency et priority sur les trois langues', () => {
    const entrees = entreesLocalisees({
      chemin: '/properties/x',
      lastModified: '2026-08-27T10:00:00+00:00',
      changeFrequency: 'weekly',
      priority: 0.8,
    });
    for (const entree of entrees) {
      expect(entree.lastModified).toBe('2026-08-27T10:00:00+00:00');
      expect(entree.changeFrequency).toBe('weekly');
      expect(entree.priority).toBe(0.8);
    }
  });

  it('n’émet PAS de clé pour un champ absent — `undefined` finirait dans le XML', () => {
    // Next sérialise `lastModified` dès qu'il n'est pas `undefined`, et n'échappe rien. Une clé
    // posée à `undefined` reste absente ici ; c'est la forme qu'on fige.
    const [entree] = entreesLocalisees({ chemin: '/properties/x' });
    expect(Object.hasOwn(entree!, 'lastModified')).toBe(false);
  });

  it('REFUSE un chemin de surface non localisée — contrat point 5', () => {
    // Sans ce refus, `alternatesLangues` lèverait de toute façon, mais avec un message qui parle
    // de `hreflang` : le lecteur du rouge chercherait au mauvais endroit.
    expect(() => entreesLocalisees({ chemin: '/app/overview' })).toThrow(/sitemap/);
    expect(() => entreesLocalisees({ chemin: '/api/me/profiles' })).toThrow(/sitemap/);
  });
});

describe('cheminDeFiche — un slug hostile ne casse pas le XML', () => {
  it('encode `&`, que Next n’échappe pas', () => {
    // Mesuré dans `node_modules/next/dist/build/webpack/loaders/metadata/resolve-route-data.js` :
    // `content += \`<loc>${item.url}</loc>\``. Un `&` nu rendrait le sitemap ENTIER invalide.
    expect(cheminDeFiche('villa & jardin')).toBe('/properties/villa%20%26%20jardin');
    expect(urls(entreesLocalisees({ chemin: cheminDeFiche('a&b') }))[0]).not.toMatch(/[&<>]/);
  });

  it('encode les chevrons et les guillemets', () => {
    expect(cheminDeFiche('a<b>"c"')).not.toMatch(/[<>"]/);
  });
});

describe('absolu — TCK-431 · AC5', () => {
  it('préfixe l’origine', () => {
    expect(absolu('/fr/properties/x')).toBe(`${ORIGINE_SITE}/fr/properties/x`);
  });

  it('refuse un chemin relatif', () => {
    expect(() => absolu('fr/properties/x')).toThrow(/absolu/);
  });

  it('refuse une URL portant « undefined »', () => {
    // Le cas réel : une interpolation d'un champ nul (`/properties/${bien.slug}` sur un slug
    // absent). L'URL serait absolue, bien formée, et fausse.
    expect(() => absolu('/fr/properties/undefined')).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});

describe('construireSitemap', () => {
  it('refuse de TRONQUER au-delà de la limite du protocole', () => {
    const trop = Array.from({ length: Math.ceil(LIMITE_URL_PAR_SITEMAP / LOCALES.length) + 1 }, (_, i) => ({
      chemin: cheminDeFiche(`bien-${i}`),
    }));
    expect(() => construireSitemap(trop)).toThrow(/generateSitemaps/);
    expect(() => construireSitemap(trop)).toThrow(new RegExp(String(LIMITE_URL_PAR_SITEMAP)));
  });

  it('accepte le plus grand catalogue qui tienne sous la limite', () => {
    const pages = Math.floor(LIMITE_URL_PAR_SITEMAP / LOCALES.length);
    const juste = Array.from({ length: pages }, (_, i) => ({ chemin: cheminDeFiche(`bien-${i}`) }));
    expect(construireSitemap(juste)).toHaveLength(pages * LOCALES.length);
    // 16 666 fiches × 3 langues = 49 998 : la limite n'est pas divisible par le nombre de langues,
    // et c'est le compte d'URL qui la borne, pas le compte de fiches.
    expect(pages * LOCALES.length).toBeLessThanOrEqual(LIMITE_URL_PAR_SITEMAP);
  });
});

describe('CHEMINS_INTERDITS_AUX_ROBOTS — TCK-431 · AC2', () => {
  it('interdit les quatre surfaces que l’AC nomme', () => {
    // L'AC exige que le test échoue si l'une des quatre disparaissait : elles sont nommées une par
    // une, pas comptées.
    for (const chemin of ['/app', '/admin', '/super-admin', '/api']) {
      expect(CHEMINS_INTERDITS_AUX_ROBOTS, chemin).toContain(chemin);
    }
  });

  it('interdit aussi les trois autres surfaces internes', () => {
    for (const chemin of ['/auth', '/onboarding', '/publish']) {
      expect(CHEMINS_INTERDITS_AUX_ROBOTS, chemin).toContain(chemin);
    }
  });

  it('n’interdit PAS `/_next` — le CSS et le JS du site', () => {
    // Un moteur qui ne peut charger ni la feuille de style ni le JS rend la page nue et juge ce
    // qu'il voit. C'est la soustraction explicite de `SEGMENTS_SERVIS_AUX_ROBOTS`.
    expect(CHEMINS_INTERDITS_AUX_ROBOTS).not.toContain('/_next');
    expect(CHEMINS_INTERDITS_AUX_ROBOTS).not.toContain('/_vercel');
  });

  it('n’interdit aucune surface publique', () => {
    for (const chemin of ['/fr', '/properties', '/agencies', '/agents', '/playground']) {
      expect(CHEMINS_INTERDITS_AUX_ROBOTS, chemin).not.toContain(chemin);
    }
  });
});
