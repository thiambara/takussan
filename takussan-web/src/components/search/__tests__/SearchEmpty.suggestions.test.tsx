import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import type { SuggestResponse } from '@/types/search';

/**
 * TCK-911 (P01.09) — à zéro résultat sur un terme, l'état vide propose les suggestions de
 * `SuggestService` : les villes, quartiers et types que la barre de recherche aurait proposés.
 *
 * Une suggestion REMPLACE le terme qui n'a rien trouvé (`q` retiré) et garde les autres critères,
 * comme la suggestion choisie dans la barre (`urlDeSuggestion`).
 */

let parametres = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/properties',
  useSearchParams: () => parametres,
}));

const suggestion = vi.hoisted(() => ({
  appels: [] as Array<{ q: string; enabled: boolean | undefined }>,
  reponse: undefined as SuggestResponse | undefined,
}));
vi.mock('@/hooks/useSuggest', () => ({
  useSuggest: (q: string, options: { enabled?: boolean } = {}) => {
    suggestion.appels.push({ q, enabled: options.enabled });
    return { data: options.enabled === false ? undefined : suggestion.reponse, isLoading: false, isFetching: false };
  },
}));

vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));

import { SearchEmpty } from '../SearchEmpty';
import type { SearchFilters } from '@/types/search';

const REPONSE: SuggestResponse = {
  data: {
    cities: [{ label: 'Keur Massar', count: 12 }],
    neighborhoods: [{ label: 'Keur Gorgui', city: 'Dakar', count: 4 }],
    property_types: [{ label: 'Villa', value: 'villa', count: 30 }],
  },
};

function monte(filters: SearchFilters, criteresEnCause = true) {
  return render(
    withIntl(
      <SearchEmpty
        filters={filters}
        activeCount={Object.keys(filters).length}
        criteresEnCause={criteresEnCause}
        onRemoveFilter={vi.fn()}
        onReset={vi.fn()}
      />,
    ),
  );
}

function parametresDu(lien: HTMLElement): URLSearchParams {
  const href = lien.getAttribute('href') ?? '';
  return new URLSearchParams(href.slice(href.indexOf('?')));
}

beforeEach(() => {
  suggestion.appels = [];
  suggestion.reponse = REPONSE;
  parametres = new URLSearchParams('q=ker&contract_type=rent&page=3');
});

describe('TCK-911 — des suggestions dans l’état vide', () => {
  it('interroge les suggestions sur le terme de la recherche', () => {
    monte({ q: 'ker', contract_type: 'rent' });
    expect(suggestion.appels.some((a) => a.q === 'ker' && a.enabled !== false)).toBe(true);
  });

  it('rend chaque suggestion en lien, sous un intitulé qui les nomme', () => {
    monte({ q: 'ker', contract_type: 'rent' });
    const bloc = screen.getByRole('navigation', { name: 'Essayez plutôt' });
    const liens = within(bloc).getAllByRole('link');
    expect(liens.map((l) => l.textContent)).toEqual(['Keur Massar', 'Keur Gorgui, Dakar', 'Villa']);
  });

  it('une ville remplace le terme, garde les autres critères et revient à la page 1', () => {
    monte({ q: 'ker', contract_type: 'rent' });
    const p = parametresDu(screen.getByRole('link', { name: 'Keur Massar' }));
    expect(p.get('city')).toBe('Keur Massar');
    expect(p.get('contract_type')).toBe('rent');
    expect(p.has('q')).toBe(false);
    expect(p.has('search')).toBe(false);
    expect(p.has('page')).toBe(false);
  });

  it('un quartier pose sa ville et son nom ; un type pose sa valeur', () => {
    monte({ q: 'ker', contract_type: 'rent' });
    const quartier = parametresDu(screen.getByRole('link', { name: 'Keur Gorgui, Dakar' }));
    expect(quartier.get('city')).toBe('Dakar');
    expect(quartier.get('location')).toBe('Keur Gorgui');
    expect(quartier.has('q')).toBe(false);
    const type = parametresDu(screen.getByRole('link', { name: 'Villa' }));
    expect(type.get('type')).toBe('villa');
    expect(type.has('q')).toBe(false);
  });

  it('les liens portent la langue de la page', () => {
    monte({ q: 'ker', contract_type: 'rent' });
    expect(screen.getByRole('link', { name: 'Keur Massar' }).getAttribute('href')).toMatch(/^\/(fr\/)?(properties|biens)/);
  });

  it('rien quand le moteur ne suggère rien', () => {
    suggestion.reponse = { data: { cities: [], neighborhoods: [], property_types: [] } };
    monte({ q: 'ker' });
    expect(screen.queryByRole('navigation', { name: 'Essayez plutôt' })).toBeNull();
  });

  it('rien sans terme de recherche, et aucune requête de suggestion', () => {
    parametres = new URLSearchParams('contract_type=rent');
    monte({ contract_type: 'rent' });
    expect(screen.queryByRole('navigation', { name: 'Essayez plutôt' })).toBeNull();
    expect(suggestion.appels.every((a) => a.enabled === false)).toBe(true);
  });

  it('rien au-delà de la dernière page : les critères ne sont pas en cause', () => {
    monte({ q: 'ker' }, false);
    expect(screen.queryByRole('navigation', { name: 'Essayez plutôt' })).toBeNull();
  });
});
