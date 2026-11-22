/**
 * TCK-2638 (lot B2) — le bureau de la liste des biens (maquette `app-biens`) :
 *
 *  - Gestion : un panneau de filtres à gauche — ouvert dès `w1440`, replié en bouton « Filtres » dessous,
 *    déplié EN PLACE par ce bouton (décision 1 a) — et une carte qui porte la barre (recherche, tri,
 *    « N biens »), la liste et la pagination ;
 *  - l'occupation du panneau est celle des pastilles et des tuiles : même requête, mêmes comptes ;
 *  - « Retards d'abord » est le tri par défaut de la Gestion, et l'URL reste nue tant qu'on le garde ;
 *  - Annonces : la barre porte recherche, type, visibilité, agent et tri ; le reste dans le même panneau,
 *    replié ;
 *  - rien ne se perd : chaque critère d'avant est atteignable depuis le panneau ou la barre.
 *
 * jsdom ne charge aucune CSS : les classes de largeur (`lg:`, `w1440:`) se lisent sur les éléments.
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PropertyListFilters } from '@/components/property-dashboard/PropertyListFilters';
import { withIntl } from '@/test/intl';
import type { ResumeDuPortefeuille } from '@/types/property';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => nav.params,
}));

const AGENTS = [
  { id: 1, name: 'Moi Même' },
  { id: 8, name: 'Awa Diop' },
];

const RESUME = {
  total: 84,
  occupied: 61,
  vacant: 9,
  rent_late: 6,
  notice: 3,
  for_sale: 0,
} as unknown as ResumeDuPortefeuille;

function rendre(
  mode: 'gestion' | 'annonces',
  extra: Partial<React.ComponentProps<typeof PropertyListFilters>> = {},
) {
  return render(
    withIntl(
      <PropertyListFilters
        currentUserId={1}
        agentOptions={AGENTS}
        mode={mode}
        resume={mode === 'gestion' ? RESUME : undefined}
        total={84}
        {...extra}
      />,
    ),
  );
}

const classes = (el: Element) => el.className.split(/\s+/);
const bouton = () => screen.getByRole('button', { name: /^Filtres et tri/ });
const panneau = () => screen.queryByTestId('panneau-de-filtres');
const barre = () => screen.getByTestId('filtres-ordinateur');

/** Le dernier `?…` passé à `router.replace`, puis remise à zéro. */
function derniereUrl(): string {
  const url = nav.replace.mock.calls.at(-1)?.[0] as string | undefined;
  nav.replace.mockClear();
  return url ?? '(aucun appel)';
}

async function choisir(user: ReturnType<typeof userEvent.setup>, portee: HTMLElement, combobox: string, option: string) {
  await user.click(within(portee).getByRole('combobox', { name: combobox }));
  await user.click(await screen.findByRole('option', { name: option }));
}

/** Le bureau (`lg`) pour `matchMedia` : le bouton « Filtres » y déplie le panneau. */
function auBureau(oui: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) => ({ matches: oui, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
  );
}

beforeEach(() => {
  nav.params = new URLSearchParams();
  nav.replace.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('Gestion — le panneau et le bouton « Filtres »', () => {
  it('ouvert dès w1440, replié en bouton dessous ; le bouton s’efface quand le panneau est là', () => {
    rendre('gestion');
    expect(classes(panneau()!)).toEqual(expect.arrayContaining(['hidden', 'w1440:block']));
    expect(classes(panneau()!)).not.toContain('lg:block');
    expect(classes(bouton())).toContain('w1440:hidden');
  });

  it('au bureau sous 1440, « Filtres » déplie le panneau EN PLACE (décision 1 a), sans feuille', async () => {
    auBureau(true);
    const user = userEvent.setup();
    rendre('gestion');
    await user.click(bouton());
    expect(classes(panneau()!)).toContain('lg:block');
    expect(classes(bouton())).toContain('lg:hidden');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('« Replier les filtres » le referme à toute largeur ; « Filtres » le rouvre', async () => {
    auBureau(true);
    const user = userEvent.setup();
    rendre('gestion');
    await user.click(screen.getByRole('button', { name: 'Replier les filtres' }));
    expect(panneau()).toBeNull();
    expect(classes(bouton())).not.toContain('w1440:hidden');
    expect(classes(bouton())).not.toContain('lg:hidden');
    await user.click(bouton());
    expect(panneau()).not.toBeNull();
  });

  it('au téléphone, le même bouton ouvre la feuille', async () => {
    auBureau(false);
    const user = userEvent.setup();
    rendre('gestion');
    await user.click(bouton());
    expect(await screen.findByRole('dialog', { name: 'Filtres et tri' })).toBeInTheDocument();
  });
});

describe('Gestion — l’occupation du panneau (les pastilles en boutons radio)', () => {
  it('comptée par le résumé, cochée par l’URL', () => {
    nav.params = new URLSearchParams('mode=gestion&occupancy=vacant');
    rendre('gestion');
    const groupe = within(panneau()!).getByRole('group', { name: 'Occupation' });
    const radios = within(groupe).getAllByRole('radio');
    expect(radios.map((r) => r.closest('label')!.textContent)).toEqual([
      'Tous84',
      'Occupés61',
      'Vacants9',
      'Loyer en retard6',
      'Préavis3',
    ]);
    expect(within(groupe).getByRole('radio', { name: /Vacants/ })).toBeChecked();
  });

  it('la même requête que la pastille : elle remplace la précédente, garde le reste, repart de la page 1', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams('mode=gestion&occupancy=vacant&search=Mermoz&page=3');
    rendre('gestion');
    await user.click(within(panneau()!).getByRole('radio', { name: /Loyer en retard/ }));
    expect(derniereUrl()).toBe('?mode=gestion&search=Mermoz&rent_late=1');
    await user.click(within(panneau()!).getByRole('radio', { name: /Tous/ }));
    expect(derniereUrl()).toBe('?mode=gestion&search=Mermoz');
  });

  it('« À vendre » seulement quand le portefeuille en compte', () => {
    rendre('gestion', { resume: { ...RESUME, for_sale: 14 } as ResumeDuPortefeuille });
    expect(within(panneau()!).getByRole('radio', { name: /À vendre/ })).toBeInTheDocument();
  });
});

describe('Gestion — « Retards d’abord » par défaut, URL nue', () => {
  it('sans `sort`, le tri affiché est « Retards d’abord »', () => {
    rendre('gestion');
    expect(within(barre()).getByRole('combobox', { name: 'Tri' })).toHaveTextContent('Retards d’abord');
  });

  it('revenir au défaut retire `sort` de l’URL ; un autre tri l’écrit', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams('mode=gestion&sort=price');
    rendre('gestion');
    await choisir(user, barre(), 'Tri', 'Retards d’abord');
    expect(derniereUrl()).toBe('?mode=gestion');
    await choisir(user, barre(), 'Tri', 'Plus récents');
    expect(derniereUrl()).toBe('?mode=gestion&sort=-created_at');
  });

  it('en Annonces, le défaut reste « Plus récents », et il n’écrit rien non plus', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams('mode=annonces&sort=price');
    rendre('annonces');
    await choisir(user, barre(), 'Tri', 'Plus récents');
    expect(derniereUrl()).toBe('?mode=annonces');
  });
});

describe('Pendant une recherche — le sélecteur dit l’ordre appliqué (vérification adverse)', () => {
  it('Gestion : sans `sort`, l’API classe par pertinence, et c’est ce que le sélecteur affiche', () => {
    nav.params = new URLSearchParams('mode=gestion&search=almadies');
    rendre('gestion');
    expect(within(barre()).getByRole('combobox', { name: 'Tri' })).toHaveTextContent('Pertinence');
  });

  it('Annonces : de même, plus « Plus récents » pendant une recherche', () => {
    nav.params = new URLSearchParams('mode=annonces&search=almadies');
    rendre('annonces');
    expect(within(barre()).getByRole('combobox', { name: 'Tri' })).toHaveTextContent('Pertinence');
  });

  it('Gestion : « Retards d’abord » s’écrit alors dans l’URL, et « Pertinence » l’efface', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams('mode=gestion&search=almadies');
    const { unmount } = rendre('gestion');
    await choisir(user, barre(), 'Tri', 'Retards d’abord');
    expect(derniereUrl()).toBe('?mode=gestion&search=almadies&sort=retard');
    unmount();

    nav.params = new URLSearchParams('mode=gestion&search=almadies&sort=retard');
    rendre('gestion');
    await choisir(user, barre(), 'Tri', 'Pertinence');
    expect(derniereUrl()).toBe('?mode=gestion&search=almadies');
  });

  it('Annonces : « Plus récents » s’écrit alors dans l’URL', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams('mode=annonces&search=almadies');
    rendre('annonces');
    await choisir(user, barre(), 'Tri', 'Plus récents');
    expect(derniereUrl()).toBe('?mode=annonces&search=almadies&sort=-created_at');
  });

  it('la feuille du téléphone coche « Pertinence », et « Retards d’abord » y écrit `sort` aussi', async () => {
    auBureau(false);
    const user = userEvent.setup();
    nav.params = new URLSearchParams('mode=gestion&search=almadies');
    rendre('gestion');
    await user.click(bouton());
    const feuille = await screen.findByRole('dialog', { name: 'Filtres et tri' });
    expect(within(feuille).getByRole('radio', { name: 'Pertinence' })).toBeChecked();
    await user.click(within(feuille).getByRole('radio', { name: 'Retards d’abord' }));
    expect(derniereUrl()).toBe('?mode=gestion&search=almadies&sort=retard');
  });

  it('sans recherche, « Pertinence » n’est pas proposé', async () => {
    const user = userEvent.setup();
    rendre('gestion');
    await user.click(within(barre()).getByRole('combobox', { name: 'Tri' }));
    expect(await screen.findByRole('option', { name: 'Retards d’abord' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Pertinence' })).toBeNull();
  });
});

describe('Gestion — la carte de la liste', () => {
  it('« N biens » au bout de la barre ; la liste et la pagination dans la carte', () => {
    rendre('gestion', {
      sousLaBarre: <p>pastilles</p>,
      pied: <p>pagination</p>,
      children: <p>liste</p>,
    });
    expect(screen.getByTestId('total-de-la-liste')).toHaveTextContent('84 biens');
    const carte = screen.getByText('liste').parentElement!;
    expect(classes(carte)).toEqual(expect.arrayContaining(['lg:rounded-xl', 'lg:border', 'lg:bg-card']));
    expect(carte.textContent).toBe(
      `${carte.firstElementChild!.textContent}pastilleslistepagination`,
    );
  });

  it('« Réinitialiser » n’apparaît qu’avec un filtre', () => {
    nav.params = new URLSearchParams('mode=gestion&per_page=50');
    rendre('gestion');
    expect(within(panneau()!).queryByRole('button', { name: 'Réinitialiser' })).toBeNull();
  });

  it('« Réinitialiser » efface les filtres, l’occupation comprise, et garde le mode', async () => {
    const user = userEvent.setup();
    nav.params = new URLSearchParams('mode=gestion&occupancy=vacant&type=villa');
    rendre('gestion');
    await user.click(within(panneau()!).getByRole('button', { name: 'Réinitialiser' }));
    expect(derniereUrl()).toBe('?mode=gestion');
  });
});

describe('Rien ne se perd — chaque critère d’avant est atteignable au bureau', () => {
  it('Gestion : tout est dans le panneau, le tri dans la barre', () => {
    rendre('gestion');
    const p = panneau()!;
    for (const nom of ['Type', 'Agent assigné', 'Statut', 'Contrat', 'Visibilité']) {
      expect(within(p).getByRole('combobox', { name: nom })).toBeInTheDocument();
    }
    for (const nom of ['Ville', 'Prix minimum', 'Prix maximum']) {
      expect(within(p).getByRole('textbox', { name: nom })).toBeInTheDocument();
    }
    expect(within(p).getAllByLabelText('Créé après').length).toBeGreaterThan(0);
    expect(within(p).getAllByLabelText('Créé avant').length).toBeGreaterThan(0);
    expect(within(p).getByRole('switch', { name: 'Mes biens' })).toBeInTheDocument();
    expect(within(p).getByRole('switch', { name: 'Archivés' })).toBeInTheDocument();
    expect(within(barre()).getByRole('combobox', { name: 'Tri' })).toBeInTheDocument();
  });

  it('la saisie libre se valide par « Appliquer », comme avant', async () => {
    const user = userEvent.setup();
    rendre('gestion');
    const p = panneau()!;
    await user.type(within(p).getByRole('textbox', { name: 'Ville' }), 'Dakar');
    await user.type(within(p).getByRole('textbox', { name: 'Prix maximum' }), '400000');
    await user.click(within(p).getByRole('button', { name: 'Appliquer' }));
    expect(derniereUrl()).toBe('?city=Dakar&price_max=400000');
  });

  it('Annonces : type, visibilité, agent et tri dans la barre ; le reste dans le panneau, replié au départ', async () => {
    auBureau(true);
    const user = userEvent.setup();
    rendre('annonces');
    expect(panneau()).toBeNull();
    for (const nom of ['Type', 'Visibilité', 'Agent assigné', 'Tri']) {
      expect(within(barre()).getByRole('combobox', { name: nom })).toBeInTheDocument();
    }
    expect(screen.queryByTestId('total-de-la-liste')).toBeNull();

    await user.click(bouton());
    const p = panneau()!;
    expect(within(p).queryByRole('group', { name: 'Occupation' })).toBeNull();
    // Pas de doublon de la barre dans le panneau.
    for (const nom of ['Type', 'Visibilité', 'Agent assigné']) {
      expect(within(p).queryByRole('combobox', { name: nom })).toBeNull();
    }
    for (const nom of ['Statut', 'Contrat']) {
      expect(within(p).getByRole('combobox', { name: nom })).toBeInTheDocument();
    }
    expect(within(p).getByRole('textbox', { name: 'Ville' })).toBeInTheDocument();
    expect(within(p).getByRole('switch', { name: 'Mes biens' })).toBeInTheDocument();
    expect(within(p).getByRole('switch', { name: 'Archivés' })).toBeInTheDocument();
  });

  it('la barre des Annonces produit la même URL que le critère d’avant', async () => {
    const user = userEvent.setup();
    rendre('annonces');
    await choisir(user, barre(), 'Visibilité', 'Privé');
    expect(derniereUrl()).toBe('?visibility=private');
    await choisir(user, barre(), 'Agent assigné', 'Awa Diop');
    expect(derniereUrl()).toBe('?user_id=8');
  });

  it('le bailleur n’a pas « Mes biens » dans le panneau', () => {
    rendre('gestion', { basculeMesBiens: false });
    expect(within(panneau()!).queryByRole('switch', { name: 'Mes biens' })).toBeNull();
    expect(within(panneau()!).getByRole('switch', { name: 'Archivés' })).toBeInTheDocument();
  });

  it('les interrupteurs écrivent la même URL que les cases de la feuille', async () => {
    const user = userEvent.setup();
    rendre('gestion');
    await user.click(within(panneau()!).getByRole('switch', { name: 'Mes biens' }));
    expect(derniereUrl()).toBe('?only_mine=1');
    await user.click(within(panneau()!).getByRole('switch', { name: 'Archivés' }));
    expect(derniereUrl()).toBe('?include_archived=1');
  });
});
