import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import type { SearchFilters } from '@/types/search';

/**
 * TCK-557 — la pagination de `/properties` est faite de LIENS.
 *
 * Elle était faite de `<button onClick>` : aucune page au-delà de la première n'était atteignable
 * par un lien — ni par un robot, ni par un « ouvrir dans un onglet ». Ces tests éprouvent les
 * `href` eux-mêmes (ce qu'un robot lit), l'interception du clic (ce que le visiteur vit), et la
 * réduction du nombre d'éléments sous `md` (la mise en page, elle, se mesure au navigateur).
 */

const push = vi.fn();
let parametres = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/fr/properties',
  useSearchParams: () => parametres,
}));

import { Pagination } from '../Pagination';

beforeEach(() => {
  push.mockReset();
  parametres = new URLSearchParams();
});

function monte(props: { currentPage: number; lastPage: number; filters?: SearchFilters }) {
  return render(
    withIntl(
      <Pagination
        currentPage={props.currentPage}
        lastPage={props.lastPage}
        filters={props.filters ?? {}}
        cibleDuDefilement="resultats"
      />,
    ),
  );
}

/** Les paramètres du `href` d'un lien de la pagination, lus comme un robot les lirait. */
function parametresDe(lien: HTMLElement): URLSearchParams {
  const href = lien.getAttribute('href') ?? '';
  expect(href.startsWith('/fr/properties')).toBe(true);
  return new URLSearchParams(href.split('?')[1] ?? '');
}

const nav = () => screen.getByRole('navigation', { name: 'Pagination' });
const lienDeLaPage = (page: number) =>
  within(nav()).getByRole('link', { name: String(page) });

describe('TCK-557 — des liens, et leur href', () => {
  it('chaque page est un <a href> qui mène à SA page', () => {
    monte({ currentPage: 1, lastPage: 5, filters: { contract_type: 'rent' } });

    for (const page of [2, 3, 4, 5]) {
      expect(parametresDe(lienDeLaPage(page)).get('page')).toBe(String(page));
    }
    expect(within(nav()).queryAllByRole('button')).toHaveLength(0);
  });

  it('les filtres courants sont CONSERVÉS dans chaque lien', () => {
    const filters: SearchFilters = {
      contract_type: 'rent',
      type: ['villa', 'house'],
      price_min: 50000,
      q: 'piscine',
      sort: 'price_asc',
    };
    monte({ currentPage: 2, lastPage: 5, filters });

    for (const page of [1, 3, 4, 5]) {
      const p = parametresDe(lienDeLaPage(page));
      expect(p.get('contract_type')).toBe('rent');
      expect(p.get('type')).toBe('villa,house');
      expect(p.get('price_min')).toBe('50000');
      expect(p.get('q')).toBe('piscine');
      expect(p.get('sort')).toBe('price_asc');
    }
  });

  it('le lien de la page 1 n’écrit PAS `page=` — la forme de la canonique', () => {
    monte({ currentPage: 2, lastPage: 5, filters: { contract_type: 'rent', page: 2 } });

    expect(lienDeLaPage(1).getAttribute('href')).toBe('/fr/properties?contract_type=rent');
    expect(screen.getByRole('link', { name: 'Page précédente' }).getAttribute('href')).toBe(
      '/fr/properties?contract_type=rent',
    );
  });

  it('sans aucun filtre, la page 1 est le chemin NU', () => {
    monte({ currentPage: 3, lastPage: 5 });
    expect(lienDeLaPage(1).getAttribute('href')).toBe('/fr/properties');
  });

  it('précédent et suivant sont des liens vers page ± 1, absents aux bornes', () => {
    monte({ currentPage: 1, lastPage: 3, filters: { contract_type: 'sale' } });

    expect(screen.queryByRole('link', { name: 'Page précédente' })).toBeNull();
    expect(parametresDe(screen.getByRole('link', { name: 'Page suivante' })).get('page')).toBe('2');
  });

  it('la page courante porte `aria-current="page"`', () => {
    monte({ currentPage: 3, lastPage: 5 });
    expect(lienDeLaPage(3)).toHaveAttribute('aria-current', 'page');
    expect(lienDeLaPage(2)).not.toHaveAttribute('aria-current');
  });
});

describe('TCK-557 — position lisible et cibles de 44 px', () => {
  it('annonce « Page X sur Y »', () => {
    monte({ currentPage: 2, lastPage: 5 });
    expect(within(nav()).getByText('Page 2 sur 5')).toBeInTheDocument();
  });

  it('chaque cible fait 44 px (`size-11`)', () => {
    monte({ currentPage: 5, lastPage: 10 });
    for (const lien of within(nav()).getAllByRole('link')) {
      expect(lien.className).toMatch(/\bsize-11\b/);
    }
  });

  /**
   * Au pire cas (page 5 sur ≥ 10), la forme de bureau rend 9 éléments : 428 px pour 328
   * disponibles à 360. Sous `md`, seuls 1, la page courante et la dernière restent, séparées
   * d'ellipses : 7 éléments, dont 5 cibles.
   */
  it('sous `md`, la page 5 sur 10 ne garde que ‹ 1 … 5 … 10 ›', () => {
    monte({ currentPage: 5, lastPage: 10 });

    const elements = Array.from(nav().querySelector('[data-rangee]')!.children) as HTMLElement[];
    const visiblesEnMobile = elements.filter((el) => !/(^|\s)hidden(\s|$)/.test(el.className));
    expect(visiblesEnMobile.map((el) => el.textContent?.trim() || el.getAttribute('aria-label'))).toEqual([
      'Page précédente', '1', '…', '5', '…', '10', 'Page suivante',
    ]);

    // Et en bureau, la forme d'origine : 1 … 4 5 6 … 10.
    const visiblesEnBureau = elements.filter((el) => !/(^|\s)md:hidden(\s|$)/.test(el.className));
    expect(visiblesEnBureau.map((el) => el.textContent?.trim() || el.getAttribute('aria-label'))).toEqual([
      'Page précédente', '1', '…', '4', '5', '6', '…', '10', 'Page suivante',
    ]);
  });
});

describe('TCK-557 — navigation client, et défilement vers les résultats', () => {
  it('un clic simple est intercepté : `router.push` du href, sans défilement de Next', () => {
    monte({ currentPage: 1, lastPage: 5, filters: { contract_type: 'rent' } });

    const lien = lienDeLaPage(2);
    const evenement = fireEvent.click(lien);

    expect(evenement).toBe(false); // preventDefault() : pas de rechargement complet
    expect(push).toHaveBeenCalledWith(lien.getAttribute('href'), { scroll: false });
  });

  it('un clic avec modificateur (nouvel onglet) est laissé au navigateur', () => {
    monte({ currentPage: 1, lastPage: 5 });

    const evenement = fireEvent.click(lienDeLaPage(2), { metaKey: true });
    expect(evenement).toBe(true);
    fireEvent.click(lienDeLaPage(3), { ctrlKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it('un clic sur la page courante ne navigue pas', () => {
    monte({ currentPage: 2, lastPage: 5 });
    fireEvent.click(lienDeLaPage(2));
    expect(push).not.toHaveBeenCalled();
  });

  it('défile vers le début des résultats une fois l’URL changée — et pas avant', () => {
    const cible = document.createElement('div');
    cible.id = 'resultats';
    cible.scrollIntoView = vi.fn();
    document.body.appendChild(cible);

    const { rerender } = monte({ currentPage: 1, lastPage: 5 });
    fireEvent.click(lienDeLaPage(2));
    // Le défilement n'a pas lieu au clic : l'entrée d'historique de la page 1 garderait sinon
    // la position des résultats au lieu de celle du visiteur (TCK-335).
    expect(cible.scrollIntoView).not.toHaveBeenCalled();

    parametres = new URLSearchParams('page=2');
    rerender(
      withIntl(
        <Pagination currentPage={1} lastPage={5} filters={{}} cibleDuDefilement="resultats" />,
      ),
    );
    expect(cible.scrollIntoView).toHaveBeenCalledTimes(1);

    // Un changement d'URL qui ne vient pas de la pagination (un filtre) ne défile pas.
    parametres = new URLSearchParams('page=2&type=villa');
    rerender(
      withIntl(
        <Pagination currentPage={2} lastPage={5} filters={{}} cibleDuDefilement="resultats" />,
      ),
    );
    expect(cible.scrollIntoView).toHaveBeenCalledTimes(1);

    cible.remove();
  });
});
