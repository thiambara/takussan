import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';
import type { SearchFilters } from '@/types/search';

vi.mock('@/components/search/ChoixDuReferentiel', () => import('./doublure-choix-du-referentiel'));

/**
 * TCK-335, étape 3 — les brouillons de saisie du panneau de filtres publics.
 *
 * ## Pourquoi ce test porte sur le COMPOSANT et non sur `PropertiesDiscoveryPage`
 *
 * Au niveau de la page, `useRouter` est moqué, donc `useSearchParams` ne change jamais, donc
 * l'effet de `useSearch` ne se rejoue jamais. Ici, la seule frontière observée est
 * `onFilterChange`, celle que les brouillons gouvernent.
 *
 * ## TCK-633 (lot E) — ce qui a disparu, et pourquoi
 *
 * La ville, le quartier et les équipements ne sont plus des champs LIBRES : ils se choisissent
 * dans des listes (référentiel géographique, catalogue). L'anti-rebond qu'exigeaient leurs frappes
 * (AC7a, AC7b, AC7e, AC7g de TCK-335) n'a plus d'objet et a été retiré avec eux. Restent les
 * bornes numériques, qui gardent leur brouillon et ne commitent qu'au `blur` / `Enter` (AC7d), et
 * la règle que ce fichier existe pour tenir : **un geste discret ne perd jamais une saisie en
 * cours** (AC7c, AC7f, « Autour de moi ») — désormais éprouvée sur la borne de prix.
 *
 * {@link frappe} enchaîne ses `fireEvent.change` dans une seule tâche : aucun minuteur ne peut
 * échoir pendant la frappe, et `expect(onFilterChange).not.toHaveBeenCalled()` est vrai par
 * construction, pas par marge (TCK-478).
 */

const PLACEHOLDER_PRIX_MIN = 'Min';

function monte(filters: SearchFilters = {}) {
  const onFilterChange = vi.fn();
  const onReset = vi.fn();
  render(
    withIntl(
      <FilterSidebar
        filters={filters}
        onFilterChange={onFilterChange}
        onReset={onReset}
        activeCount={0}
        open={false}
        onClose={() => {}}
      />,
    ),
  );
  return { onFilterChange, onReset };
}

function frappe(input: HTMLElement, texte: string) {
  for (let i = 1; i <= texte.length; i += 1) {
    fireEvent.change(input, { target: { value: texte.slice(0, i) } });
  }
}

describe('<FilterSidebar> — brouillons des bornes numériques (TCK-335)', () => {
  it('AC7c — cliquer une puce pendant une saisie de prix CONSERVE LES DEUX', () => {
    const { onFilterChange } = monte();
    const prixMin = screen.getByPlaceholderText(PLACEHOLDER_PRIX_MIN) as HTMLInputElement;

    frappe(prixMin, '150000');
    expect(onFilterChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Acheter' }));

    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({
      price_min: 150000,
      contract_type: 'sale',
      rent_period: undefined,
      page: 1,
    });
    // Le montant n'a pas été effacé de l'écran par le clic.
    expect(prixMin.value).toBe('150000');
  });

  it("AC7d — une borne numérique ne commite QU'au blur, jamais sur un timer", async () => {
    const { onFilterChange } = monte();
    const prixMin = screen.getByPlaceholderText(PLACEHOLDER_PRIX_MIN) as HTMLInputElement;

    frappe(prixMin, '150000');
    expect(prixMin.value).toBe('150000');

    // Un anti-rebond laisserait passer `price_min=15` — qui rend LE CATALOGUE ENTIER.
    await new Promise((r) => setTimeout(r, 60));
    expect(onFilterChange).not.toHaveBeenCalled();

    fireEvent.blur(prixMin);
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith({ price_min: 150000, page: 1 }, { continu: true });
  });

  it('AC7f — le brouillon se resynchronise quand `filters` change vraiment (retour arrière)', () => {
    const onFilterChange = vi.fn();
    const communs = { onFilterChange, onReset: () => {}, open: false, onClose: () => {} };
    const { rerender } = render(
      withIntl(<FilterSidebar filters={{ price_min: 100000 }} activeCount={1} {...communs} />),
    );
    const prixMin = screen.getByPlaceholderText(PLACEHOLDER_PRIX_MIN) as HTMLInputElement;
    expect(prixMin.value).toBe('100000');

    fireEvent.change(prixMin, { target: { value: '2' } });
    expect(prixMin.value).toBe('2');

    rerender(withIntl(<FilterSidebar filters={{}} activeCount={0} {...communs} />));
    expect(prixMin.value).toBe('');
  });
});

/**
 * TCK-346 — le rayon est CÂBLÉ au panneau, pas seulement écrit à côté : son `onChange` arrive sur
 * `onFilterChange`, avec le brouillon de saisie en cours FUSIONNÉ.
 */
describe('<FilterSidebar> — la commande « Autour de moi » (TCK-346)', () => {
  function geolocalisationQuiRepond() {
    return {
      getCurrentPosition: vi.fn((ok: PositionCallback) =>
        ok({ coords: { latitude: 14.6928, longitude: -17.4467 }, timestamp: 0 } as unknown as GeolocationPosition)),
    };
  }

  function monteAvecGeo(filters: SearchFilters = {}) {
    const onFilterChange = vi.fn();
    render(
      withIntl(
        <FilterSidebar
          filters={filters}
          onFilterChange={onFilterChange}
          onReset={vi.fn()}
          activeCount={0}
          open={false}
          onClose={() => {}}
          geolocalisation={geolocalisationQuiRepond()}
        />,
      ),
    );
    return { onFilterChange };
  }

  it('transmet le point et le rayon à `onFilterChange`', () => {
    const { onFilterChange } = monteAvecGeo();

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser ma position' }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 14.6928, lng: -17.4467, radius_km: 5 }),
    );
  });

  it('n’EFFACE PAS le prix en cours de frappe', () => {
    const { onFilterChange } = monteAvecGeo();
    frappe(screen.getByPlaceholderText(PLACEHOLDER_PRIX_MIN), '150000');

    fireEvent.click(screen.getByRole('button', { name: 'Utiliser ma position' }));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ price_min: 150000, lat: 14.6928 }),
    );
  });

  it('affiche le choix du rayon dès qu’un point existe', () => {
    monteAvecGeo({ lat: 14.6928, lng: -17.4467, radius_km: 10 });
    expect(screen.getByRole('button', { name: '10 km' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2 km' })).toHaveAttribute('aria-pressed', 'false');
  });
});

/**
 * Le panneau ne montre PAS `q` : le terme se lit et se modifie dans le champ de recherche de la
 * barre de navigation, qui le relit dans l'URL. Une section « Mots-clés » ici en faisait une
 * seconde copie.
 */
describe('<FilterSidebar> — aucune section « Mots-clés »', () => {
  it.each([
    ['sans `q`', {}],
    ['avec `q`', { q: 'villa piscine' }],
  ])('%s : ni section, ni terme, ni champ plein-texte', (_cas, filtres) => {
    monte(filtres);
    expect(screen.queryByText('Mots-clés')).not.toBeInTheDocument();
    expect(screen.queryByText('villa piscine')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Effacer la recherche/ })).not.toBeInTheDocument();
  });
});

describe('<FilterSidebar> — bornes nommées (TCK-869)', () => {
  it('chaque borne numérique est nommée par le titre de sa section et sa borne', () => {
    monte();

    expect(screen.getByRole('spinbutton', { name: 'Budget (FCFA) Min' })).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Budget (FCFA) Max' })).toBeInTheDocument();
  });
});
