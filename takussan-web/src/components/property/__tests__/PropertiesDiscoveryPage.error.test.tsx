import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';

let parametres = new URLSearchParams('furnished=true');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/properties',
  useSearchParams: () => parametres,
}));

const mockApiFetch = vi.fn();
vi.mock('@/lib/api', async () => {
  const reel = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return { ...reel, apiFetch: (...args: unknown[]) => mockApiFetch(...args) };
});

// Chrome du site et surfaces lourdes : hors sujet ici, et elles tirent auth / carte / réseau.
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
vi.mock('@/components/map', () => ({ PropertyMap: () => null }));
vi.mock('@/components/favorites/SaveSearchButton', () => ({ SaveSearchButton: () => null }));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';
import { ApiError } from '@/lib/api';

beforeEach(() => {
  mockApiFetch.mockReset();
  parametres = new URLSearchParams('furnished=true');
});

/**
 * TCK-335 — un 422 affichait TROIS affirmations concurrentes sur le même écran :
 * « 0 biens trouvés » (le compteur), « Une erreur est survenue » (le bandeau maison)
 * et « Aucun bien trouvé » (l'état vide). Le chiffre est celui que l'œil lit en
 * premier : accompagner le mensonge d'un bandeau ne le répare pas.
 */
describe('TCK-335 — une panne ne se présente plus comme un résultat', () => {
  it('sur un 422, nomme le filtre en cause et n’affiche ni « 0 biens trouvés » ni l’état vide', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(422, { errors: { furnished: ['invalide'] } }));

    render(withIntl(<PropertiesDiscoveryPage />));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByRole('alert')).toHaveTextContent(/furnished/);
    expect(screen.queryByText(/0 biens? trouvés?/)).not.toBeInTheDocument();
    expect(screen.queryByText('Aucun bien trouvé')).not.toBeInTheDocument();
    // La prose de validation de Laravel est ANGLAISE dans les trois locales
    // (`lang/fr/validation.php` n'a pas la clé `boolean`) : elle ne doit jamais sortir.
    expect(screen.queryByText(/must be true or false/)).not.toBeInTheDocument();
    attendAucuneCleBrute();
  });

  it('sur un 500, affiche le libellé générique et pas de nom de filtre', async () => {
    mockApiFetch.mockRejectedValue(new ApiError(500, null));

    render(withIntl(<PropertiesDiscoveryPage />));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Une erreur est survenue. Veuillez réessayer.');
    });
    expect(screen.queryByText(/0 biens? trouvés?/)).not.toBeInTheDocument();
    attendAucuneCleBrute();
  });

  it('un résultat vide LÉGITIME affiche bien l’état vide et le compteur à zéro', async () => {
    mockApiFetch.mockResolvedValue({
      data: [],
      facets: {},
      meta: { total: 0, per_page: 30, current_page: 1, last_page: 1 },
    });

    render(withIntl(<PropertiesDiscoveryPage />));

    await waitFor(() => {
      expect(screen.getByText('Aucun bien trouvé')).toBeInTheDocument();
    });
    expect(screen.getByText(/0 biens? trouvés?/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
