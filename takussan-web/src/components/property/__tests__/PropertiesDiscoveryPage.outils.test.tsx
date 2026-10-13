import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';

/**
 * TCK-552 — la page assemble la barre d'outils : ce qui est rendu dépend de la vue et du nombre
 * de résultats, et la sauvegarde n'existe que lorsqu'il y a quelque chose à sauvegarder.
 */

let parametres = new URLSearchParams();

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

vi.mock('@/components/map', () => ({ PropertyMap: () => <div data-testid="carte" /> }));
vi.mock('@/components/home/Navbar', () => ({ Navbar: () => null }));
vi.mock('@/components/home/Footer', () => ({ Footer: () => null }));
// TCK-633 — les listes du référentiel interrogent l'API par React Query ; la page est montée ici
// sans `QueryClientProvider`.
vi.mock('@/components/search/ChoixDuReferentiel', () => import('@/components/search/__tests__/doublure-choix-du-referentiel'));
// La VRAIE `SaveSearchButton` est rendue — c'est elle que l'AC5 vise. Seule sa mutation, qui
// exigerait un `QueryClientProvider`, est remplacée.
vi.mock('@/lib/queries/saved-searches', () => ({
  useCreateSavedSearchMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { PropertiesDiscoveryPage } from '../PropertiesDiscoveryPage';

function reponse(total: number) {
  return {
    data: [],
    facets: {},
    meta: { total, per_page: 30, current_page: 1, last_page: 1 },
  };
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue(reponse(12));
  parametres = new URLSearchParams();
});

async function monte() {
  render(withIntl(<PropertiesDiscoveryPage />));
  await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
  // Le compteur est rendu quand la recherche est retombée : la barre est alors dans son état final.
  // TCK-558 — à zéro, il dit « Aucun bien trouvé », plus « 0 biens trouvés ».
  await screen.findByText(/^(\d+ biens? trouvés?|Aucun bien trouvé)$/);
}

const classes = (el: Element) => el.className.split(/\s+/);

/** La bascule de la rangée mobile — un bouton, pas l'onglet du bureau. */
const basculeMobile = () =>
  screen.queryAllByRole('button', { name: /^carte$|^liste$/i })
    .find((b) => b.closest('[data-controle="bascule"]'));

/**
 * TCK-635 — « Sauvegarder » est sur la ligne du titre, dans la rangée d'outils, et il n'y en a
 * qu'UN. Sous `lg`, il n'existe que s'il y a quelque chose à sauvegarder (TCK-552, AC5) ; au
 * bureau, il reste, `aria-disabled`, et son infobulle dit pourquoi.
 */
describe('TCK-552 · TCK-635 — la sauvegarde n’existe sous lg que s’il y a quelque chose à sauvegarder', () => {
  it('sans filtre : un seul bouton, masqué sous lg et inactif au bureau', async () => {
    await monte();
    const boutons = screen.getAllByRole('button', { name: /sauvegarder la recherche/i });
    expect(boutons).toHaveLength(1);
    const [sauver] = boutons;
    expect(sauver.closest('[data-rangee-outils]')).not.toBeNull();
    expect(classes(sauver)).toContain('max-lg:hidden');
    expect(sauver).toHaveAttribute('aria-disabled', 'true');
    // TCK-635 — plus aucune puce dans l'en-tête.
    expect(document.querySelector('[data-rangee="puces"]')).toBeNull();
  });

  it('avec un filtre : le bouton est dans la rangée d’outils, rendu à toutes les largeurs, et actif', async () => {
    parametres = new URLSearchParams('furnished=true');
    await monte();
    const sauver = screen.getByRole('button', { name: /sauvegarder la recherche/i });
    expect(sauver.closest('[data-rangee-outils]')).not.toBeNull();
    expect(classes(sauver)).not.toContain('max-lg:hidden');
    expect(sauver).not.toHaveAttribute('aria-disabled');
    // Le mot affiché est court ; le nom accessible le CONTIENT (WCAG 2.5.3).
    expect(sauver).toHaveTextContent('Sauvegarder');
    expect(document.querySelector('[data-rangee="puces"]')).toBeNull();
  });
});

describe('TCK-552 — tri et bascule ne sont rendus que lorsqu’ils agissent (AC8, E1, M4)', () => {
  it('liste avec résultats : tri et bascule rendus', async () => {
    await monte();
    expect(classes(screen.getByRole('combobox', { name: /trier/i }))).not.toContain('hidden');
    expect(basculeMobile()).toBeDefined();
    // AC6 — la bascule est UN contrôle de 44 px (les onglets en faisaient 24, P5).
    expect(classes(basculeMobile()!)).toContain('size-11');
  });

  it('zéro résultat : ni tri ni bascule sous lg', async () => {
    mockApiFetch.mockResolvedValue(reponse(0));
    await monte();
    expect(classes(screen.getByRole('combobox', { name: /trier/i }))).toContain('hidden');
    expect(basculeMobile()).toBeUndefined();
  });

  it('vue carte : le tri n’est plus rendu sous lg, la bascule ramène à la liste', async () => {
    await monte();
    await userEvent.click(basculeMobile()!);
    await waitFor(() => expect(screen.getByTestId('carte')).toBeInTheDocument());
    expect(classes(screen.getByRole('combobox', { name: /trier/i }))).toContain('hidden');
    expect(basculeMobile()!.getAttribute('aria-label')).toMatch(/^liste$/i);
  });
});

describe('TCK-552 — à zéro résultat, la vue carte ne devient pas un piège sous lg', () => {
  const matchMediaOriginal = window.matchMedia;
  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
  });

  it('la bascule masquée, la page retombe sur la liste et son état vide', async () => {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('max-width: 1023px'),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    const { rerender } = render(withIntl(<PropertiesDiscoveryPage />));
    await screen.findByText(/^12 biens trouvés$/);
    await userEvent.click(basculeMobile()!);
    await waitFor(() => expect(screen.getByTestId('carte')).toBeInTheDocument());

    // La recherche suivante — une autre URL, comme après un changement de filtre — ne rend rien.
    mockApiFetch.mockResolvedValue(reponse(0));
    parametres = new URLSearchParams('furnished=true');
    rerender(withIntl(<PropertiesDiscoveryPage />));

    await waitFor(() => expect(screen.queryByTestId('carte')).toBeNull());
    expect(screen.getByText(/aucun bien/i)).toBeInTheDocument();
    expect(basculeMobile()).toBeUndefined();
  });
});

describe('TCK-552 — `per_page` reste un paramètre d’URL (AC4)', () => {
  it('`?per_page=60` part tel quel à l’API, même sans contrôle sous lg', async () => {
    parametres = new URLSearchParams('per_page=60');
    await monte();
    const chemins = mockApiFetch.mock.calls.map((c) => String(c[0]));
    expect(chemins.some((c) => /[?&]per_page=60(&|$)/.test(c))).toBe(true);
  });
});
