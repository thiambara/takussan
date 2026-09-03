import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { SearchToolbar } from '../SearchToolbar';
import {
  agregateurDe,
  CLES_DE_RECHERCHE,
  SEARCH_FILTER_KEYS,
  type CleDeRechercheNom,
  type SearchFilters,
} from '@/types/search';

/**
 * TCK-340 — **ce composant n'avait aucun test**, et c'est le seul des quatre fichiers du lot
 * dans ce cas : `useSearch.ts`, `SaveSearchButton.tsx` et `types/search.ts` en portaient déjà
 * 17 depuis TCK-335 (mesuré : `npx vitest run` sur les trois → 17 passés).
 *
 * Ce que ces tests gardent, et pourquoi chacun n'est pas une case à cocher :
 *
 * | test | la régression qu'il attrape | pourquoi une régression silencieuse ne le cocherait pas |
 * |---|---|---|
 * | puces exhaustives | une clé de filtre sans fabrique de libellé | la puce rendrait la valeur BRUTE (`true`, `2026-09-01`) et la liste attendue ne correspondrait plus |
 * | contrôles muets | `sort`/`page`/`per_page` promus filtres | un tri deviendrait une puce retirable, et le compte de puces changerait |
 * | `type` éclaté | la puce multi-valuée fusionnée ou sa sous-clé perdue | `onRemoveFilter` recevrait `undefined` en sous-clé et retirerait TOUS les types d'un coup |
 * | valeur brute interdite | une clé neuve ajoutée sans libellé | c'est l'AC1 vu à l'exécution ; le typage seul ne couvre que le code qui compile |
 */

/** Une valeur par clé de `SearchFilters`, choisie DISTINCTE des autres pour que les assertions
 *  ne puissent pas se satisfaire d'une puce voisine. */
const TOUS_LES_FILTRES: SearchFilters = {
  q: 'villa vue mer',
  location: 'Almadies',
  city: 'Dakar',
  // TCK-346 — le rayon PORTE la puce, `lat`/`lng` y sont agrégées : trois clés, une puce.
  radius_km: 5,
  lat: 14.6928,
  lng: -17.4467,
  contract_type: 'rent',
  type: ['villa', 'studio'],
  rent_period: 'monthly',
  price_min: 150000,
  price_max: 900000,
  bedrooms: 3,
  bathrooms: 2,
  area_min: 40,
  area_max: 250,
  furnished: true,
  featured: true,
  floor_number: 0,
  available_from: '2026-09-01',
  title_type: 'bail',
  tags: 'piscine,parking',
  sort: 'price_asc',
  page: 7,
  per_page: 70,
};

function monte(filters: SearchFilters, onRemoveFilter = vi.fn()) {
  render(withIntl(
    <SearchToolbar
      total={12}
      loading={false}
      filters={filters}
      activeCount={17}
      onRemoveFilter={onRemoveFilter}
      onSortChange={vi.fn()}
      onPerPageChange={vi.fn()}
      onOpenSidebar={vi.fn()}
    />,
  ));
  return { onRemoveFilter };
}

/** Les puces, et rien d'autre : les deux `<Select>` et le bouton « Filtres » sont aussi des boutons. */
function puces(): string[] {
  return screen.getAllByRole('button')
    .filter((b) => b.className.includes('bg-primary/8'))
    // Espaces insécables normalisés : `toLocaleString('fr-SN')` sépare les milliers par U+202F,
    // dont la forme exacte dépend de la version d'ICU — ce n'est pas ce que le test garde.
    .map((b) => (b.textContent ?? '').replace(/[\s\u00a0\u202f]+/g, ' ').trim());
}

describe('<SearchToolbar> — les puces de filtre actif', () => {
  it('libelle CHAQUE filtre actif, et aucune puce ne rend la valeur brute', () => {
    monte(TOUS_LES_FILTRES);

    expect(puces()).toEqual([
      '"villa vue mer"',
      'Quartier : Almadies',
      'Dakar',
      'Dans un rayon de 5 km',
      'Location',
      'Villa',
      'Studio',
      'Mensuel',
      '≥ 150 000 FCFA',
      '≤ 900 000 FCFA',
      '3 ch.',
      '2 sdb',
      '≥ 40 m²',
      '≤ 250 m²',
      'Meublé',
      '★ En vedette',
      'Rez-de-chaussée',
      'Dispo dès 01 sept. 2026',
      'Titre : Bail',
      'Tags : piscine,parking',
    ]);
  });

  /**
   * Le tri, la page et la taille de page sont des CONTRÔLES : ils ne filtrent rien. Les afficher
   * en puce retirable ferait promettre à l'interface un filtre qui n'existe pas — et le retrait
   * de « 70 » ne retirerait rien de visible.
   */
  it('ne fait AUCUNE puce du tri, de la page ni de la taille de page', () => {
    monte(TOUS_LES_FILTRES);
    const texte = puces().join(' | ');
    expect(texte).not.toContain('price_asc');
    expect(texte).not.toMatch(/\b7\b/);
    expect(texte).not.toMatch(/\b70\b/);
  });

  it('rend UNE puce par valeur de `type`, et la retire par sa sous-clé', async () => {
    const user = userEvent.setup();
    const { onRemoveFilter } = monte({ type: ['villa', 'studio'] });

    expect(puces()).toEqual(['Villa', 'Studio']);

    await user.click(screen.getByRole('button', { name: 'Studio' }));
    expect(onRemoveFilter).toHaveBeenCalledWith('type', 'studio');
  });

  /** `floor_number: 0` est falsy : un `if (value)` le ferait disparaître silencieusement. */
  it('garde le rez-de-chaussée, que `0` rendrait falsy', () => {
    monte({ floor_number: 0 });
    expect(puces()).toEqual(['Rez-de-chaussée']);
  });

  it('n’affiche aucune puce quand aucun filtre n’est posé', () => {
    monte({});
    expect(puces()).toEqual([]);
  });
});

describe('<SearchToolbar> — AC1, vu à l’exécution', () => {
  /**
   * Sans ceci, l'échantillon ci-dessus serait une liste écrite à la main de plus : une clé neuve
   * ajoutée à `SEARCH_FILTER_KEYS` et oubliée ici laisserait tous les tests verts en ne testant
   * simplement pas la clé neuve. C'est le défaut que TCK-340 existe pour fermer, un cran plus bas.
   */
  it('l’échantillon couvre EXACTEMENT les clés de la table', () => {
    expect(Object.keys(TOUS_LES_FILTRES).sort()).toEqual([...CLES_DE_RECHERCHE].sort());
  });

  /**
   * `city` est le seul libellé qui SOIT la valeur brute, et c'est voulu : « Dakar » se lit mieux
   * que « Ville : Dakar » sur une puce. L'exception est écrite à la main pour que l'ajouter à
   * une seconde clé soit un geste visible en revue.
   */
  const LIBELLE_BRUT_ASSUME: readonly CleDeRechercheNom[] = ['city'];

  it('aucune puce ne rend la valeur brute du filtre', () => {
    for (const cle of CLES_DE_RECHERCHE) {
      if (SEARCH_FILTER_KEYS[cle].role !== 'filtre') continue;
      if (LIBELLE_BRUT_ASSUME.includes(cle)) continue;
      const valeur = TOUS_LES_FILTRES[cle];
      const { unmount } = render(withIntl(
        <SearchToolbar
          total={1} loading={false} filters={{ [cle]: valeur } as SearchFilters}
          activeCount={1} onRemoveFilter={vi.fn()} onSortChange={vi.fn()}
          onPerPageChange={vi.fn()} onOpenSidebar={vi.fn()}
        />,
      ));
      const rendues = puces();
      if (agregateurDe(cle)) {
        // TCK-346 — une clé AGRÉGÉE ne rend rien seule, et c'est l'invariant : sa puce est
        // celle de son agrégateur. Sans cette branche, `lat` rendrait « 14.6928 » à l'écran,
        // et son retrait laisserait `lng` — donc un 422 fabriqué par l'interface.
        // Que l'agrégateur, lui, porte bien un libellé est vérifié à son propre tour de boucle
        // et par `search-filters.parity.test.ts`.
        expect(rendues, `\`${cle}\` est agrégée : elle ne doit PAS rendre de puce`).toEqual([]);
      } else {
        expect(rendues.length, `aucune puce pour \`${cle}\``).toBeGreaterThan(0);
      }
      for (const p of rendues) {
        expect(p, `\`${cle}\` rend sa valeur brute`).not.toBe(String(valeur));
      }
      unmount();
    }
  });
});

/**
 * TCK-346 — `distance` exige une origine, et le serveur rend 422 sans elle.
 *
 * Une option de tri qui produit un 422 à coup sûr est pire qu'absente : l'utilisateur la
 * choisit, l'écran perd ses résultats, et rien dans l'interface n'explique pourquoi. Elle
 * apparaît donc avec le point et disparaît avec lui.
 */
describe('<SearchToolbar> — le tri par distance suit le point', () => {
  const POINT: SearchFilters = { lat: 14.6928, lng: -17.4467, radius_km: 5 };

  async function optionsDeTri(filters: SearchFilters): Promise<string[]> {
    const user = userEvent.setup();
    monte(filters);
    // Deux `combobox` : la taille de page, puis le tri.
    await user.click(screen.getAllByRole('combobox')[1]);
    // `findAllByRole` et non `queryAllByRole` : le panneau du `Select` (base-ui) se monte dans
    // un portail au tour de boucle SUIVANT. Lu synchroniquement, il rend une liste vide — donc
    // un « l'option n'est pas offerte » qui serait vrai de TOUTES les options à la fois.
    const options = await screen.findAllByRole('option');
    return options.map((o) => (o.textContent ?? '').trim());
  }

  it('offre « Le plus proche » quand un point est posé', async () => {
    expect(await optionsDeTri(POINT)).toContain('Le plus proche');
  });

  it('ne l’offre PAS sans point', async () => {
    expect(await optionsDeTri({ city: 'Dakar' })).not.toContain('Le plus proche');
  });

  it('ne l’offre pas non plus sur un demi-point', async () => {
    // `lat` seule rend 422 (`required_with:lng`) : proposer le tri ici serait proposer une
    // requête impossible par deux motifs à la fois.
    expect(await optionsDeTri({ lat: 14.6928 })).not.toContain('Le plus proche');
  });
});

/**
 * TCK-505, défaut #8 — à 360-390 px, la rangée du haut (`flex items-center justify-between`)
 * n'avait pas le droit de passer à la ligne, et le compteur n'avait pas le droit de garder sa
 * largeur : « 252 biens trouvés » se cassait sur trois lignes dans moins de 80 px et le bouton
 * « Filtres » était rogné à droite du viewport (mesuré le 2026-09-02).
 *
 * Deux classes portent le correctif, et chacune rougit seule par ablation : `shrink-0
 * whitespace-nowrap` sur le compteur (il garde sa ligne), `flex-wrap` sur la rangée (les
 * contrôles passent dessous quand la largeur manque).
 */
describe('<SearchToolbar> — le compteur tient sur une ligne, les contrôles passent dessous (TCK-505 #8)', () => {
  it('le compteur ne rétrécit pas et ne se casse pas', () => {
    monte({ city: 'Dakar' });
    const compteur = screen.getByText(/biens? trouvés?/);
    expect(compteur.tagName).toBe('P');
    expect(compteur.className.split(/\s+/)).toEqual(expect.arrayContaining(['shrink-0', 'whitespace-nowrap']));
  });

  it('la rangée du haut accepte le retour à la ligne', () => {
    monte({ city: 'Dakar' });
    const rangee = screen.getByText(/biens? trouvés?/).parentElement!;
    expect(rangee.className.split(/\s+/)).toContain('flex-wrap');
  });

  /**
   * Re-mesuré après le premier correctif, à 360 px : le groupe des contrôles (deux sélecteurs +
   * « Filtres ») passait bien sous le compteur, mais lui-même ne se repliait pas — 336 px de
   * contrôles dans 328 px, et le viewport s'élargissait à 368. Le groupe doit se replier aussi.
   */
  it('le groupe des contrôles se replie lui aussi quand la largeur manque', () => {
    monte({ city: 'Dakar' });
    const filtres = screen.getByRole('button', { name: /filtres/i });
    const groupe = filtres.parentElement!;
    expect(groupe.className.split(/\s+/)).toContain('flex-wrap');
  });
});
