import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { SearchToolbar } from '../SearchToolbar';
import {
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
      expect(rendues.length, `aucune puce pour \`${cle}\``).toBeGreaterThan(0);
      for (const p of rendues) {
        expect(p, `\`${cle}\` rend sa valeur brute`).not.toBe(String(valeur));
      }
      unmount();
    }
  });
});
