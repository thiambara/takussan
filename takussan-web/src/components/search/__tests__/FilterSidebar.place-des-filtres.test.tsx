import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';
import { CLES_DE_RECHERCHE, estControle, type CleDeRechercheNom, type SearchFilters } from '@/types/search';

vi.mock('@/components/search/ChoixDuReferentiel', () => import('./doublure-choix-du-referentiel'));

/**
 * TCK-633 (lot E, D3 de la vérification) — chaque filtre est confronté à sa PLACE RÉELLE dans le
 * panneau, visible ou repliée sous « Plus de filtres ».
 *
 * `CLES_REPLIEES` (FilterSidebar) est une liste écrite à la main : retirer `title_type` laissait
 * tout vert, et un lien partagé `?title_type=bail` ouvrait le panneau replié, le filtre actif caché
 * et non compté. Ce test ne lit PAS la liste : il pose chaque filtre seul, repère dans le DOM ce que
 * ce filtre a changé (puce pressée, champ rempli, valeur de liste, date affichée), regarde si c'est
 * dans le bloc replié, et en déduit ce que le bouton doit faire. La vérité est l'endroit où la
 * section est rendue ; la liste n'a plus qu'à s'y conformer.
 *
 * Exhaustif par construction : `EXEMPLES` est typé sur toutes les clés filtrantes, et le premier
 * test rougit sur une clé de la table de recherche qui n'y figure pas.
 */

type CleFiltrante = Exclude<CleDeRechercheNom, 'sort' | 'page' | 'per_page'>;

/** Hors du panneau : la recherche libre se lit et se modifie dans la barre de navigation. */
const HORS_PANNEAU = 'hors-panneau' as const;

const POINT: SearchFilters = { lat: 14.7, lng: -17.45, radius_km: 3 };

/** Un lien partagé qui ne porte QUE ce filtre (plus ce sans quoi il ne s'affiche pas). */
const EXEMPLES: Record<CleFiltrante, SearchFilters | typeof HORS_PANNEAU> = {
  q: HORS_PANNEAU,
  location: { location: 'Almadies' },
  city: { city: 'Dakar' },
  radius_km: POINT,
  lat: POINT,
  lng: POINT,
  contract_type: { contract_type: 'sale' },
  type: { type: ['villa'] },
  // La fréquence de loyer n'a de section que sous « Louer ».
  rent_period: { contract_type: 'rent', rent_period: 'monthly' },
  price_min: { price_min: 150000 },
  price_max: { price_max: 300000 },
  bedrooms: { bedrooms: 3 },
  bathrooms: { bathrooms: 2 },
  area_min: { area_min: 100 },
  area_max: { area_max: 200 },
  furnished: { furnished: false },
  featured: { featured: true },
  floor_number: { floor_number: 0 },
  available_from: { available_from: '2030-01-15' },
  title_type: { title_type: 'bail' },
  condition: { condition: ['new'] },
  tags: { tags: 'Piscine' },
};

function monte(filters: SearchFilters) {
  render(
    withIntl(
      <FilterSidebar
        filters={filters}
        onFilterChange={vi.fn()}
        onReset={vi.fn()}
        activeCount={0}
        open={false}
        onClose={() => {}}
      />,
    ),
  );
}

function boutonPlus(): HTMLElement {
  return screen.getByRole('button', { name: /^(Plus|Moins) de filtres/ });
}

/** L'état d'un contrôle : ce qu'un filtre posé y change. */
function signature(el: Element): string {
  return [
    el.tagName,
    el.getAttribute('aria-pressed') ?? '',
    el.getAttribute('data-valeur') ?? '',
    el.getAttribute('data-valeurs') ?? '',
    el instanceof HTMLInputElement ? el.value : '',
    el.textContent ?? '',
  ].join('|');
}

/** Les contrôles du panneau (le bouton « Plus de filtres » excepté), rangés par place. */
function releve(): { visibles: Set<string>; replies: Set<string> } {
  const plus = boutonPlus();
  const bloc = document.getElementById(plus.getAttribute('aria-controls')!)!;
  const visibles = new Set<string>();
  const replies = new Set<string>();
  for (const el of document.querySelectorAll('button, input, [data-valeur], [data-valeurs]')) {
    if (el === plus) continue;
    (bloc.contains(el) ? replies : visibles).add(signature(el));
  }
  return { visibles, replies };
}

function nouveaux(apres: Set<string>, avant: Set<string>): string[] {
  return [...apres].filter((s) => !avant.has(s));
}

afterEach(cleanup);

describe('TCK-633 (D3) — chaque filtre à sa place, et « Plus de filtres » le sait', () => {
  it('chaque clé filtrante de la table de recherche a son exemple', () => {
    const filtrantes = CLES_DE_RECHERCHE.filter((cle) => !estControle(cle));
    expect(Object.keys(EXEMPLES).sort()).toEqual([...filtrantes].sort());
  });

  const cles = Object.keys(EXEMPLES) as CleFiltrante[];

  it.each(cles)('« %s » : un lien qui ne porte que lui ouvre « Plus de filtres » si, et seulement si, il y est rangé', (cle) => {
    const exemple = EXEMPLES[cle];
    monte({});
    const repos = releve();
    cleanup();

    if (exemple === HORS_PANNEAU) {
      monte({ [cle]: 'villa' } as SearchFilters);
      const { visibles, replies } = releve();
      expect(nouveaux(replies, repos.replies)).toEqual([]);
      expect(nouveaux(visibles, repos.visibles)).toEqual([]);
      expect(boutonPlus()).toHaveAttribute('aria-expanded', 'false');
      return;
    }

    monte(exemple);
    const { visibles, replies } = releve();
    const dansLeBloc = nouveaux(replies, repos.replies);
    const dehors = nouveaux(visibles, repos.visibles);
    // Le filtre a une trace dans le panneau : sinon il serait actif et invisible d'ici.
    expect(dansLeBloc.length + dehors.length, `« ${cle} » ne change rien au panneau`).toBeGreaterThan(0);

    if (dansLeBloc.length === 0) {
      expect(boutonPlus(), `« ${cle} » est visible : le bloc reste replié`).toHaveAttribute('aria-expanded', 'false');
      expect(boutonPlus()).toHaveTextContent(/^Plus de filtres$/);
      return;
    }

    // Rangé sous « Plus de filtres » : ouvert d'office, et compté une fois replié à la main.
    expect(dehors, `« ${cle} » est à la fois visible et replié`).toEqual([]);
    expect(boutonPlus(), `« ${cle} » est replié et actif : le bloc doit s'ouvrir`).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(boutonPlus());
    expect(boutonPlus()).toHaveTextContent(/^Plus de filtres \(1\)$/);
  });
});
