import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTranslator } from 'next-intl';

import en from '@/messages/en.json';
import fr from '@/messages/fr.json';
import wo from '@/messages/wo.json';
import { origineSite } from '@/lib/alternates';
import { TIMEZONE, type Locale } from '@/i18n/config';
import { clefDeRecherche, parametresDeRecherche } from '@/lib/recherche-publique';
import type { SearchResult } from '@/types/search';

/**
 * TCK-433 · AC1 et AC3 — la métadonnée de `/properties`.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI `createTranslator` ET NON UN DOUBLE DE `getTranslations`
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Les gabarits de titre sont de l'**ICU** — `{contract, select, rent {…} sale {…} other {…}}` —
 * précisément pour que chaque langue décide de son ordre et de sa préposition. Le double naïf
 * employé ailleurs dans ce dépôt (`gabarit.replace(/\{(\w+)\}/g, …)`) ne comprend pas `select` :
 * il rendrait le gabarit brut, et le test serait vert sur un titre que personne ne peut lire.
 *
 * `createTranslator` est le traducteur RÉEL de next-intl, alimenté par les vrais dictionnaires. Un
 * gabarit malformé dans l'une des trois langues fait donc rougir ici, ce qui est l'essentiel de
 * l'AC3 : *« dans les trois langues servies »*.
 */

const DICTIONNAIRES: Record<Locale, Record<string, unknown>> = {
  fr: fr as Record<string, unknown>,
  en: en as Record<string, unknown>,
  wo: wo as Record<string, unknown>,
};

/** Même deep-merge qu'en production (`src/i18n/request.ts`) : `fr` sert de repli sous les autres. */
function fusionne(base: Record<string, unknown>, surcharge: Record<string, unknown>) {
  const sortie = { ...base };
  for (const [cle, valeur] of Object.entries(surcharge)) {
    const existant = sortie[cle];
    sortie[cle] =
      valeur && typeof valeur === 'object' && !Array.isArray(valeur) &&
      existant && typeof existant === 'object' && !Array.isArray(existant)
        ? fusionne(existant as Record<string, unknown>, valeur as Record<string, unknown>)
        : valeur;
  }
  return sortie;
}

let localeCourante: Locale = 'fr';

/**
 * Le domaine des villes vient de l'API ; il est doublé ici pour que le test porte sur la RÈGLE et
 * non sur l'état du catalogue de développement. Deux villes, casse canonique du catalogue.
 */
vi.mock('@/lib/queries/facettes', async () => {
  const { domainesStatiques } = await import('@/lib/canonique');
  const villes = new Map([
    ['dakar', 'Dakar'],
    ['thiès', 'Thiès'],
    ['ziguinchor', 'Ziguinchor'],
  ]);
  return {
    villesDuCatalogue: async () => villes,
    // TCK-598 — le domaine des quartiers INDEXABLES de Dakar (seuil déjà appliqué : c'est
    // `quartiersDeLaVille` qui le juge, éprouvée dans `queries/__tests__/facettes.test.ts`).
    // Les autres villes n'en ont aucun.
    domainesDeLaListe: async (params: URLSearchParams) => ({
      ...domainesStatiques(),
      villes,
      quartiers:
        (params.get('city') ?? '').trim().toLocaleLowerCase('fr') === 'dakar'
          ? new Map([['mermoz', 'Mermoz']])
          : null,
    }),
    FRAICHEUR_DOMAINE_VILLES: 3600,
    // TCK-841 (P35.03) — le compte du lieu, pris au domaine : 198 biens à Dakar, 4 à Mermoz.
    compteDuLieu: async (ville: string, quartier?: string) =>
      ville === 'Dakar' ? (quartier === 'Mermoz' ? 4 : quartier ? undefined : 198) : undefined,
  };
});

/**
 * TCK-675 — la recherche que `generateMetadata` partage avec la page. Doublée à la frontière de
 * `rechercherBiensPublics` : le test porte sur la règle « liste vide ⇒ `noindex` », pas sur le
 * catalogue. `totalServi` vaut `null` pour simuler une panne (la fonction rend alors `null`).
 */
let totalServi: number | null = 3;
/** TCK-915 — le nombre de pages servi ; 10 par défaut, pour qu'un `page=9` reste dans la liste. */
let dernierePageServie = 10;
const recherchesDemandees: Array<[string, string]> = [];

vi.mock('@/lib/queries/public-search', () => ({
  rechercherBiensPublics: async (requete: string, locale: string): Promise<SearchResult | null> => {
    recherchesDemandees.push([requete, locale]);
    if (totalServi === null) return null;
    return {
      data: [],
      meta: { current_page: 1, last_page: dernierePageServie, per_page: 30, total: totalServi },
    } as unknown as SearchResult;
  },
}));

vi.mock('next-intl/server', () => ({
  getLocale: async () => localeCourante,
  getTranslations: async (namespace?: string) => {
    const messages =
      localeCourante === 'fr'
        ? DICTIONNAIRES.fr
        : fusionne(DICTIONNAIRES.fr, DICTIONNAIRES[localeCourante]);
    return createTranslator({
      locale: localeCourante,
      messages: messages as never,
      namespace: namespace as never,
      timeZone: TIMEZONE,
    });
  },
}));

const { generateMetadata } = await import('../page');

const metadonnee = (requete: Record<string, string | string[]>, locale: Locale = 'fr') => {
  localeCourante = locale;
  return generateMetadata({ searchParams: Promise.resolve(requete) });
};

beforeEach(() => {
  localeCourante = 'fr';
  totalServi = 3;
  dernierePageServie = 10;
  recherchesDemandees.length = 0;
});

describe('TCK-433 · AC1 — la canonique nomme la règle', () => {
  it('l’URL de l’AC se replie sur la facette retenue et sa page, préfixée de la langue', async () => {
    const meta = await metadonnee({
      type: 'villa',
      page: '3',
      sort: '-created_at',
      per_page: '48',
    });

    // Elle ne recopie PAS l'URL demandée : ni `sort`, ni `per_page`. La page, elle, reste :
    // TCK-915 (P09.08), décision du porteur, « canonique propre à chaque page ».
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties?type=villa&page=3`);
    expect(String(meta.alternates!.canonical)).not.toContain('sort=');
    expect(String(meta.alternates!.canonical)).not.toContain('per_page=');
  });

  it('la page nue est canonique d’elle-même', async () => {
    const meta = await metadonnee({});
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties`);
  });

  it('un filtre écarté ne crée pas d’URL indexable', async () => {
    const meta = await metadonnee({ price_min: '45000', q: 'villa piscine' });
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties`);
  });

  it('la canonique suit la langue servie', async () => {
    const meta = await metadonnee({ city: 'Dakar' }, 'wo');
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/wo/properties?city=Dakar`);
  });

  it('les hreflang désignent la MÊME URL canonique, dans les trois langues', async () => {
    const meta = await metadonnee({ type: 'villa', page: '9' });
    const { languages } = meta.alternates!;
    expect(languages!.fr).toBe(`${origineSite()}/fr/properties?type=villa&page=9`);
    expect(languages!.en).toBe(`${origineSite()}/en/properties?type=villa&page=9`);
    expect(languages!.wo).toBe(`${origineSite()}/wo/properties?type=villa&page=9`);
  });
});

describe('TCK-433 · AC3 — le titre nomme le filtre, dans les trois langues', () => {
  it('le titre nu reste le titre générique', async () => {
    expect((await metadonnee({})).title).toBe(fr.meta.properties.title);
  });

  it.each<[Locale, string, string]>([
    ['fr', 'Villa', 'Dakar'],
    ['en', 'Villa', 'Dakar'],
    ['wo', 'Wiila', 'Dakar'],
  ])('%s : le titre filtré diffère du nu et nomme type ET ville', async (locale, type, ville) => {
    const nu = (await metadonnee({}, locale)).title as string;
    const filtre = (await metadonnee({ type: 'villa', city: 'Dakar' }, locale)).title as string;

    expect(filtre).not.toBe(nu);
    expect(filtre).toContain(type);
    expect(filtre).toContain(ville);
  });

  it.each<[Locale, string]>([
    ['fr', 'à louer'],
    ['en', 'for rent'],
    ['wo', 'luwaa'],
  ])('%s : le contrat entre dans le titre par son gabarit ICU', async (locale, marqueur) => {
    const titre = (await metadonnee({ type: 'villa', contract_type: 'rent' }, locale))
      .title as string;
    expect(titre.toLowerCase()).toContain(marqueur.toLowerCase());
  });

  it('aucun gabarit ICU ne fuit dans le titre rendu', async () => {
    // Le défaut qu'un double naïf de `getTranslations` cacherait : `{contract, select, …}` rendu
    // littéralement. Vérifié dans les trois langues et sur les huit combinaisons de facettes.
    for (const locale of ['fr', 'en', 'wo'] as const) {
      for (const type of [undefined, 'villa']) {
        for (const contract_type of [undefined, 'rent', 'sale']) {
          for (const city of [undefined, 'Thiès']) {
            const requete = Object.fromEntries(
              Object.entries({ type, contract_type, city }).filter(([, v]) => v !== undefined),
            ) as Record<string, string>;
            const meta = await metadonnee(requete, locale);
            const rendu = `${meta.title} | ${meta.description}`;
            expect(rendu, `${locale} ${JSON.stringify(requete)}`).not.toMatch(/[{}]/);
            expect(rendu).not.toContain('select,');
          }
        }
      }
    }
  });

  it('la description filtrée reprend le titre et diffère de la générique', async () => {
    const meta = await metadonnee({ type: 'villa', city: 'Dakar' });
    expect(meta.description).not.toBe(fr.meta.properties.description);
    expect(meta.description).toContain(meta.title as string);
  });

  it('TCK-841 (P35.03) — une page de ville ou de quartier dit le nombre de biens du lieu', async () => {
    const ville = await metadonnee({ type: 'villa', city: 'dakar' });
    expect(ville.description).toContain('198 biens publiés à Dakar');
    expect(ville.description).toContain(ville.title as string);

    const quartier = await metadonnee({ city: 'Dakar', location: 'mermoz' });
    expect(quartier.description).toContain('4 biens publiés à Mermoz, Dakar');

    // Un lieu hors domaine n'est pas retenu : ni compte, ni lieu.
    expect((await metadonnee({ city: 'Inventée' })).description).not.toMatch(/biens publiés/);
  });

  it('un type MULTIPLE retombe sur le titre générique — il n’est pas canonique', async () => {
    const meta = await metadonnee({ type: 'villa,house' });
    expect(meta.title).toBe(fr.meta.properties.title);
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties`);
  });

  describe('une valeur HORS DOMAINE ne fuit pas dans ce qui est servi — passe 2', () => {
    /*
     * Mesuré sur un build de production le 2026-08-27 :
     *
     *   curl '…/fr/properties?type=zzznexistepas'
     *     <title>property.types.zzznexistepas — Takussan</title>
     *     <link rel="canonical" href="…/fr/properties?type=zzznexistepas">
     *     <meta name="robots" content="index, follow">
     *
     * Une clé d'i18n brute servie à un moteur, sur une page canonique d'elle-même. Les 24
     * combinaisons du test voisin ne pouvaient pas le voir : **elles étaient toutes construites
     * avec des valeurs valides.** C'est le trou que ce bloc ferme.
     */
    it.each<[Locale, Record<string, string>]>([
      ['fr', { type: 'zzznexistepas' }],
      ['en', { type: 'zzznexistepas' }],
      ['wo', { type: 'zzznexistepas' }],
      ['fr', { contract_type: 'zzznexistepas' }],
      ['fr', { city: 'Zzzinventee' }],
      ['fr', { city: '' }],
      ['fr', { type: 'zzz', contract_type: 'zzz', city: 'Zzz' }],
    ])('%s %o : aucun préfixe de clé dans le titre ni la description', async (locale, requete) => {
      const meta = await metadonnee(requete, locale);
      const rendu = `${meta.title} | ${meta.description}`;

      expect(rendu, rendu).not.toContain('property.');
      expect(rendu, rendu).not.toContain('meta.');
      expect(rendu, rendu).not.toContain('zzz');
      expect(rendu, rendu).not.toContain('Zzz');
    });

    it.each<Record<string, string>>([
      { type: 'zzznexistepas' },
      { contract_type: 'zzznexistepas' },
      { city: 'Zzzinventee' },
    ])('%o : la canonique se replie sur la page nue', async (requete) => {
      const meta = await metadonnee(requete);
      expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties`);
    });

    it('le titre redevient le générique, pas un titre à moitié dérivé', async () => {
      expect((await metadonnee({ type: 'zzz', city: 'Zzz' })).title).toBe(fr.meta.properties.title);
    });

    it('une facette VALIDE reste intacte à côté d’une invalide', async () => {
      // Le contrôle d'ablation : sans lui, une règle qui replierait TOUT passerait le bloc entier.
      const meta = await metadonnee({ type: 'villa', city: 'Zzzinventee' });
      expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties?type=villa`);
      expect(meta.title).toContain('Villa');
    });

    it('la casse d’une ville valide se replie sur celle du catalogue', async () => {
      const meta = await metadonnee({ city: 'DAKAR' });
      expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties?city=Dakar`);
      expect(meta.title).toContain('Dakar');
      expect(meta.title).not.toContain('DAKAR');
    });
  });

  it('une ville du domaine, non traduite, passe telle quelle sans « null » ni clé brute', async () => {
    const titre = (await metadonnee({ city: 'Ziguinchor' })).title as string;
    expect(titre).toContain('Ziguinchor');
    expect(titre).not.toContain('null');
    expect(titre).not.toContain('meta.');
  });
});

describe('TCK-598 · AC11 — le quartier dans la canonique et le titre', () => {
  it('`?city=Dakar&location=Inventé` a pour canonique `?city=Dakar`', async () => {
    const meta = await metadonnee({ city: 'Dakar', location: 'Inventé' });
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties?city=Dakar`);
    expect(meta.title).not.toContain('Inventé');
  });

  it('un quartier du domaine est canonique de lui-même, casse du catalogue', async () => {
    const meta = await metadonnee({ city: 'dakar', location: 'MERMOZ', page: '2' });
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties?city=Dakar&location=Mermoz&page=2`);
    expect(meta.alternates!.languages!.wo).toBe(`${origineSite()}/wo/properties?city=Dakar&location=Mermoz&page=2`);
  });

  it('un quartier sans ville ne crée pas d’URL indexable', async () => {
    const meta = await metadonnee({ location: 'Mermoz' });
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties`);
  });

  it.each<[Locale, string]>([
    ['fr', 'à Mermoz, Dakar'],
    ['en', 'in Mermoz, Dakar'],
    ['wo', 'ci Mermoz, Dakar'],
  ])('%s : le titre nomme le quartier ET la ville, sans gabarit qui fuit', async (locale, attendu) => {
    const meta = await metadonnee({ type: 'villa', city: 'Dakar', location: 'Mermoz' }, locale);
    const rendu = `${meta.title} | ${meta.description}`;
    expect(meta.title).toContain(attendu);
    expect(meta.title).toContain('Dakar');
    expect(rendu).not.toMatch(/[{}]/);
    expect(rendu).not.toContain('meta.');
  });

  it('un quartier replié ne laisse pas le gabarit de quartier dans le titre', async () => {
    const meta = await metadonnee({ city: 'Thiès', location: 'Mermoz' });
    expect(meta.title).toContain('Thiès');
    expect(meta.title).not.toContain('Mermoz');
  });
});

describe('TCK-675 · P09.02 — une liste vide n’est pas une page à indexer', () => {
  // Décision du porteur : « noindex, follow quand total === 0 ».
  const requete = { type: 'factory', contract_type: 'rent', city: 'Dakar' };

  it('total === 0 : `noindex, follow`', async () => {
    totalServi = 0;
    const meta = await metadonnee(requete);
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('total > 0 : aucune clé `robots`, le layout (`index, follow`) s’applique', async () => {
    totalServi = 1;
    const meta = await metadonnee(requete);
    expect(meta.robots).toBeUndefined();
  });

  it('recherche en panne : rien n’est affirmé, aucune clé `robots`', async () => {
    totalServi = null;
    const meta = await metadonnee(requete);
    expect(meta.robots).toBeUndefined();
  });

  it('la recherche demandée est CELLE de la page — même clef, même langue — pour que `cache()` la partage', async () => {
    totalServi = 0;
    await metadonnee({ ...requete, tags: ['a', 'b'], page: '2' }, 'en');
    const attendue = new URLSearchParams();
    for (const [cle, valeur] of Object.entries({ ...requete, page: '2' })) attendue.append(cle, valeur);
    attendue.append('tags', 'a');
    attendue.append('tags', 'b');
    expect(recherchesDemandees).toEqual([[clefDeRecherche(parametresDeRecherche(attendue)), 'en']]);
  });
});

describe('TCK-915 · P09.08 — chaque page de la liste est canonique d’elle-même', () => {
  it.each([[{}], [{ page: '1' }], [{ page: '0' }], [{ page: 'abc' }], [{ page: '-2' }], [{ page: '2.5' }]])(
    '%o : canonique sans `page`',
    async (requete) => {
      const meta = await metadonnee({ type: 'villa', ...requete });
      expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties?type=villa`);
    },
  );

  it('la page nue, en page 2, porte `?page=2`', async () => {
    const meta = await metadonnee({ page: '2' });
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties?page=2`);
  });

  it('au-delà de `last_page` : `noindex, follow`', async () => {
    totalServi = 40;
    dernierePageServie = 2;
    const meta = await metadonnee({ type: 'villa', page: '9' });
    expect(meta.robots).toEqual({ index: false, follow: true });
  });

  it('la dernière page elle-même reste indexable', async () => {
    totalServi = 40;
    dernierePageServie = 2;
    const meta = await metadonnee({ type: 'villa', page: '2' });
    expect(meta.robots).toBeUndefined();
    expect(meta.alternates!.canonical).toBe(`${origineSite()}/fr/properties?type=villa&page=2`);
  });

  it('recherche en panne : rien n’est affirmé sur la page', async () => {
    totalServi = null;
    const meta = await metadonnee({ type: 'villa', page: '99' });
    expect(meta.robots).toBeUndefined();
  });
});
