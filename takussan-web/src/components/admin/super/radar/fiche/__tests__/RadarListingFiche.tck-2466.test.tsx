import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchRadarMatches } from '@/lib/queries/radar';
import { EXTRACTED, fiche, rendreFiche, reponseMatches } from './support';

/**
 * TCK-2466, affiché par TCK-2469 à la demande de la session — une valeur lue sur la page (`source: "page"`) le dit, et
 * quand le modèle la contredisait (`source_conflict`), la fiche montre ce qu'il proposait, dans le vocabulaire du champ.
 */

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/queries/radar', async (importOriginal) => (await import('./mocks')).mockRadarQueries(await importOriginal<object>()));
vi.mock('@/lib/queries/referentiel-public', async () => (await import('./mocks')).mockReferentiel());

Element.prototype.scrollIntoView = vi.fn();

beforeEach(() => {
  vi.mocked(fetchRadarMatches).mockReset().mockResolvedValue(reponseMatches([]));
});

const LUE_SUR_LA_PAGE = fiche({
  source_kind: 'url',
  source_site: 'coinafrique',
  extracted: {
    ...EXTRACTED,
    price: {
      value: 95000000, confidence: 'high', evidence: null, flags: ['source_conflict'], period: null,
      source: 'page', model_value: 120000000,
    },
    property_type: { value: 'villa', confidence: 'high', evidence: null, flags: ['source_conflict'], source: 'page', model_value: 'house' },
    contract: { value: 'sale', confidence: 'high', evidence: null, flags: [], source: 'page' },
  },
});

describe('La fiche dit ce qui a été lu sur la page (TCK-2466)', () => {
  it('« Lu sur la page » sur chaque champ lu, et rien sur un champ du modèle', async () => {
    await rendreFiche(LUE_SUR_LA_PAGE);

    expect(screen.getByTestId('champ-contract-lu-sur-la-page')).toHaveTextContent('Lu sur la page');
    expect(screen.getByTestId('champ-price-lu-sur-la-page')).toBeInTheDocument();
    expect(screen.queryByTestId('champ-title-lu-sur-la-page')).toBeNull();
    // Lu sans contradiction : aucune alerte.
    expect(screen.getByTestId('champ-contract')).not.toHaveAttribute('data-alerte');
  });

  it('une contradiction alerte par son libellé et montre la valeur que l\'IA proposait, mise en forme', async () => {
    await rendreFiche(LUE_SUR_LA_PAGE);

    const prix = screen.getByTestId('champ-price');
    expect(prix).toHaveAttribute('data-alerte', 'true');
    expect(within(prix).getByText(/La page dit autre chose que l’IA/)).toBeInTheDocument();
    expect(prix).not.toHaveTextContent('source_conflict');
    expect(within(prix).getByTestId('champ-price-proposition-ia')).toHaveTextContent(/^L’IA proposait : 120\s000\s000\sF\sCFA$/u);

    expect(within(screen.getByTestId('champ-property_type')).getByTestId('champ-property_type-proposition-ia'))
      .toHaveTextContent('L’IA proposait : Maison');
    expect(screen.queryByTestId('champ-contract-proposition-ia')).toBeNull();
  });

  it('en anglais aussi, sans repli français', async () => {
    await rendreFiche(LUE_SUR_LA_PAGE, 'en');

    expect(screen.getByTestId('champ-contract-lu-sur-la-page')).toHaveTextContent('Read on the page');
    expect(screen.getByTestId('champ-price-proposition-ia')).toHaveTextContent(/^The AI suggested: /);
  });
});
