import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

import { withIntl } from '@/test/intl';
import { FilterSidebar } from '../FilterSidebar';
import type { SearchFilters } from '@/types/search';

vi.mock('@/components/search/ChoixDuReferentiel', () => import('./doublure-choix-du-referentiel'));

/**
 * TCK-633 (lot E) — retours du porteur du 2026-10-11 sur le panneau de filtres public.
 *
 * - « Louer » avant « Acheter », dans le vocabulaire de la barre (et non « Vente » / « Location ») ;
 * - chambres, salles de bain et étage sont des MINIMUMS : les puces le disent (« 5+ », « 2e et + ») ;
 * - « Meublé » a trois états : indifférent, oui, non — la bascule « Meublé uniquement » ne savait pas
 *   demander un logement vide.
 */

function monte(filters: SearchFilters = {}) {
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
      />,
    ),
  );
  return { onFilterChange };
}

/** Déplie « Plus de filtres » s'il existe et est replié ; sans effet sinon. */
function deplier() {
  const bouton = screen.queryByRole('button', { name: /^Plus de filtres/ });
  if (bouton) fireEvent.click(bouton);
}

/** Les libellés des boutons d'une section, dans l'ordre du document. */
function boutonsDeLaSection(titre: string): string[] {
  const section = screen.getByRole('heading', { name: titre }).parentElement!;
  return within(section).getAllByRole('button').map((b) => b.textContent ?? '');
}

describe('TCK-633 — la transaction : « Louer » d’abord', () => {
  it('propose Louer puis Acheter, dans cet ordre', () => {
    monte();
    expect(boutonsDeLaSection('Type de transaction')).toEqual(['Louer', 'Acheter']);
  });

  it('« Louer » pose contract_type=rent', () => {
    const { onFilterChange } = monte();
    fireEvent.click(screen.getByRole('button', { name: 'Louer' }));
    expect(onFilterChange).toHaveBeenCalledWith({ contract_type: 'rent', rent_period: undefined, page: 1 });
  });
});

describe('TCK-633 — chambres, salles de bain et étage sont des minimums', () => {
  it('les chambres se lisent « 1+ » à « 5+ », et « 5+ » pose bedrooms=5', () => {
    const { onFilterChange } = monte();
    expect(boutonsDeLaSection('Chambres')).toEqual(['1+', '2+', '3+', '4+', '5+']);
    fireEvent.click(screen.getByRole('button', { name: '5+' }));
    expect(onFilterChange).toHaveBeenCalledWith({ bedrooms: 5, page: 1 });
  });

  it('les salles de bain se lisent « 1+ » à « 3+ »', () => {
    monte();
    deplier();
    expect(boutonsDeLaSection('Salles de bain')).toEqual(['1+', '2+', '3+']);
  });

  it('l’étage se lit « RDC et + » à « 4e et + », et « 2e et + » pose floor_number=2', () => {
    const { onFilterChange } = monte();
    deplier();
    expect(boutonsDeLaSection('Étage')).toEqual(['RDC et +', '1er et +', '2e et +', '3e et +', '4e et +']);
    fireEvent.click(screen.getByRole('button', { name: '2e et +' }));
    expect(onFilterChange).toHaveBeenCalledWith({ floor_number: 2, page: 1 });
  });
});

describe('TCK-633 — « Meublé » : indifférent, oui, non', () => {
  it('sans filtre, « Indifférent » est pressé', () => {
    monte();
    deplier();
    expect(boutonsDeLaSection('Meublé')).toEqual(['Indifférent', 'Oui', 'Non']);
    expect(screen.getByRole('button', { name: 'Indifférent' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('« Non » demande un logement vide (furnished=false)', () => {
    const { onFilterChange } = monte();
    deplier();
    fireEvent.click(screen.getByRole('button', { name: 'Non' }));
    expect(onFilterChange).toHaveBeenCalledWith({ furnished: false, page: 1 });
  });

  it('« Indifférent » retire le filtre', () => {
    const { onFilterChange } = monte({ furnished: false });
    deplier();
    expect(screen.getByRole('button', { name: 'Non' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Indifférent' }));
    expect(onFilterChange).toHaveBeenCalledWith({ furnished: undefined, page: 1 });
  });

  it('un clic sur « Indifférent » déjà pressé n’envoie rien', () => {
    const { onFilterChange } = monte();
    deplier();
    fireEvent.click(screen.getByRole('button', { name: 'Indifférent' }));
    expect(onFilterChange).not.toHaveBeenCalled();
  });

  it('la bascule « Meublé uniquement » n’existe plus', () => {
    monte();
    deplier();
    expect(screen.queryByRole('button', { name: /Meublé uniquement/ })).not.toBeInTheDocument();
  });
});

describe('TCK-633 — ville, quartier et équipements se choisissent dans des listes', () => {
  it('le panneau ne porte plus de champ de texte libre pour la ville, le quartier ni les équipements', () => {
    monte();
    deplier();
    expect(screen.queryByPlaceholderText('Ville (ex : Dakar, Mbour…)')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/^Quartier \(ex/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/piscine, parking/)).not.toBeInTheDocument();
    expect(screen.getByTestId('choix-ville')).toBeInTheDocument();
    expect(screen.getByTestId('choix-quartier')).toBeInTheDocument();
    expect(screen.getByTestId('choix-equipements')).toBeInTheDocument();
  });

  it('choisir une ville la pose et retire un quartier qui appartenait à une autre', () => {
    const { onFilterChange } = monte({ city: 'Thiès', location: 'Almadies' });
    fireEvent.click(screen.getByRole('button', { name: 'choisir-ville-Dakar' }));
    expect(onFilterChange).toHaveBeenCalledWith({ city: 'Dakar', location: undefined, page: 1 });
    // `toHaveBeenCalledWith` tient une clé `undefined` pour égale à une clé ABSENTE — or le patch
    // est fusionné dans les filtres courants : sans la clé, « Almadies » survivrait à Thiès.
    const patch = onFilterChange.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(patch)).toContain('location');
  });

  it('re-choisir la même ville garde le quartier', () => {
    const { onFilterChange } = monte({ city: 'Dakar', location: 'Almadies' });
    fireEvent.click(screen.getByRole('button', { name: 'choisir-ville-Dakar' }));
    expect(onFilterChange).toHaveBeenCalledWith({ city: 'Dakar', location: 'Almadies', page: 1 });
  });

  it('le quartier reçoit la ville choisie, et se pose par son nom', () => {
    const { onFilterChange } = monte({ city: 'Dakar' });
    expect(screen.getByTestId('choix-quartier')).toHaveAttribute('data-ville', 'Dakar');
    fireEvent.click(screen.getByRole('button', { name: 'choisir-quartier-Almadies' }));
    expect(onFilterChange).toHaveBeenCalledWith({ location: 'Almadies', page: 1 });
  });

  it('les équipements s’ajoutent à la liste à virgules de l’URL', () => {
    const { onFilterChange } = monte({ tags: 'Parking' });
    deplier();
    expect(screen.getByTestId('choix-equipements')).toHaveAttribute('data-valeurs', 'Parking');
    fireEvent.click(screen.getByRole('button', { name: 'ajouter-Piscine' }));
    expect(onFilterChange).toHaveBeenCalledWith({ tags: 'Parking,Piscine', page: 1 });
  });

  it('le rappel dit que les équipements se combinent en ET (décision 4 du porteur)', () => {
    monte();
    deplier();
    expect(screen.getByText('Biens offrant tous les équipements choisis')).toBeInTheDocument();
  });
});

/**
 * TCK-633 (lot E, AC5) — les essentiels restent visibles (transaction, type, lieu, budget,
 * chambres) ; le reste se replie sous « Plus de filtres ». Un filtre replié ACTIF ouvre le bloc
 * d'office : un filtre actif qu'on ne voit pas serait un filtre qu'on ne peut pas retirer d'ici.
 */
describe('TCK-633 — « Plus de filtres »', () => {
  const ESSENTIELS = ['Type de transaction', 'Type de bien', 'Localisation', 'Autour de moi', 'Budget (FCFA)', 'Chambres'];
  const REPLIES = ['Salles de bain', 'Surface (m²)', 'Meublé', 'État du bien', 'Étage', 'Statut foncier', 'Disponibilité', 'Équipements'];

  it('replié par défaut : les essentiels seuls sont visibles', () => {
    monte();
    for (const titre of ESSENTIELS) expect(screen.getByRole('heading', { name: titre })).toBeInTheDocument();
    for (const titre of REPLIES) expect(screen.queryByRole('heading', { name: titre })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Plus de filtres' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('les essentiels sont dans l’ordre transaction, type, lieu, budget, chambres', () => {
    monte();
    const titres = ['Type de transaction', 'Type de bien', 'Localisation', 'Budget (FCFA)', 'Chambres']
      .map((nom) => screen.getByRole('heading', { name: nom }));
    for (let i = 1; i < titres.length; i += 1) {
      expect(titres[i - 1]!.compareDocumentPosition(titres[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('déplié : le reste apparaît, et le bouton se referme', () => {
    monte();
    fireEvent.click(screen.getByRole('button', { name: 'Plus de filtres' }));
    for (const titre of REPLIES) expect(screen.getByRole('heading', { name: titre })).toBeInTheDocument();
    const bouton = screen.getByRole('button', { name: 'Moins de filtres' });
    expect(bouton).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(bouton.getAttribute('aria-controls')!)).not.toBeNull();
  });

  it('un filtre replié actif ouvre le bloc d’office', () => {
    monte({ bathrooms: 2 });
    expect(screen.getByRole('heading', { name: 'Salles de bain' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Moins de filtres' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('replié à la main, le bouton compte les filtres repliés actifs', () => {
    monte({ bathrooms: 2, furnished: false, tags: 'Piscine' });
    fireEvent.click(screen.getByRole('button', { name: 'Moins de filtres' }));
    expect(screen.getByRole('button', { name: 'Plus de filtres (3)' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('un filtre essentiel ne compte pas parmi les repliés', () => {
    monte({ bedrooms: 3, city: 'Dakar', price_min: 1000 });
    expect(screen.getByRole('button', { name: 'Plus de filtres' })).toHaveAttribute('aria-expanded', 'false');
  });
});
