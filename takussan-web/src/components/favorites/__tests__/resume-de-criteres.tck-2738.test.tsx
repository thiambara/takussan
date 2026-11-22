/**
 * TCK-2738 — le résumé d'une recherche sauvegardée, éprouvé sur le module que les écrans VIVANTS
 * lisent (`useResumeDeCriteres` : l'onglet « Recherches » de la page des favoris, l'accueil du
 * client), et non plus à travers `SavedSearchesList`, que plus aucune page ne rendait.
 *
 * Repris tels quels de `SavedSearchesList.equipements.test.tsx` (TCK-633) et de
 * `SavedSearchesList.villes.tck-2061.test.tsx` (P185.02) :
 *
 * - TCK-633 — un équipement du catalogue est traduit dans la langue de l'écran (par son slug,
 *   `libelleEquipementParNom`), un équipement proposé par un annonceur reste tel quel ;
 * - P185.02 — les villes posées depuis le profil (`criteria.cities`) se lisent dans le résumé, et
 *   l'aller-retour `criteria` → URL → filtres → URL → `criteria` les garde.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl, type LocaleDeTest } from '@/test/intl';
import { filtersFromSearchParams, filtersToParams } from '@/hooks/useSearch';
import { filtersToCriteria } from '../SaveSearchButton';
import { useResumeDeCriteres } from '../resume-de-criteres';

function Resume({ criteria }: { readonly criteria: Record<string, unknown> }) {
  const resume = useResumeDeCriteres();
  return <p data-testid="resume">{resume(criteria)}</p>;
}

const monte = (criteria: Record<string, unknown>, locale: LocaleDeTest = 'fr') =>
  render(withIntl(<Resume criteria={criteria} />, locale));

describe('useResumeDeCriteres — équipements traduits (TCK-633)', () => {
  it('en anglais : le catalogue traduit, l’équipement proposé tel quel', () => {
    monte({ tags: 'Piscine,Jardin potager' }, 'en');
    expect(screen.getByTestId('resume')).toHaveTextContent(/^Amenities: Swimming pool, Jardin potager$/);
  });

  it('en wolof : le catalogue traduit', () => {
    monte({ tags: 'Piscine,Climatisation' }, 'wo');
    expect(screen.getByTestId('resume')).toHaveTextContent(/^Jumtukaay : Pisin, Klimatisasioŋ$/);
  });

  it('en français : un équipement d’annonceur hors catalogue reste tel quel', () => {
    monte({ tags: 'Hammam maison' });
    expect(screen.getByTestId('resume')).toHaveTextContent(/^Équipements : Hammam maison$/);
  });
});

describe('useResumeDeCriteres — les villes du profil (P185.02, TCK-2061)', () => {
  it('le résumé nomme chaque ville', () => {
    monte({ cities: ['Dakar', 'Thiès'] });
    expect(screen.getByTestId('resume')).toHaveTextContent(/^Dakar · Thiès$/);
  });

  it('aller-retour criteria → URL → filtres → URL → criteria', () => {
    const filtres = filtersFromSearchParams(new URLSearchParams('cities=Dakar,Thiès&price_max=300000'));
    expect(filtres.cities).toEqual(['Dakar', 'Thiès']);
    expect(filtersToParams(filtres).get('cities')).toBe('Dakar,Thiès');
    expect(filtersToCriteria(filtres)).toEqual({ cities: ['Dakar', 'Thiès'], price_max: 300000 });
  });

  it('un segment vide ne fabrique pas de ville', () => {
    expect(filtersFromSearchParams(new URLSearchParams('cities=Dakar,,')).cities).toEqual(['Dakar']);
    expect(filtersFromSearchParams(new URLSearchParams('cities=')).cities).toBeUndefined();
  });
});
