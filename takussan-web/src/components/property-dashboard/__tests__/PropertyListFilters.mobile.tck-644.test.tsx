/**
 * TCK-644 — « Mes biens » sur téléphone : la recherche reste à l'écran, le tri, les deux cases et
 * les filtres avancés passent derrière UN bouton « Filtres » (feuille du bas) qui compte les filtres
 * actifs. Ils changent de place, pas d'existence (AC2) : chaque commande de la feuille produit
 * EXACTEMENT l'URL que produit sa jumelle de la barre d'ordinateur — c'est cette URL que la page
 * traduit en `filter[…]` côté serveur, et elle ne change pas.
 *
 * jsdom ne charge aucune CSS : la barre d'ordinateur y est rendue aussi (`hidden lg:contents`),
 * ce qui permet de comparer les deux chemins dans le même rendu.
 */
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PropertyListFilters } from '@/components/property-dashboard/PropertyListFilters';
import { withIntl } from '@/test/intl';

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: nav.replace, refresh: vi.fn() }),
  useSearchParams: () => nav.params,
}));

const AGENTS = [
  { id: 1, name: 'Moi Même' },
  { id: 8, name: 'Awa Diop' },
];

function rendre() {
  return render(withIntl(<PropertyListFilters currentUserId={1} agentOptions={AGENTS} />));
}

/** La barre d'ordinateur : ce que la feuille remplace sous `lg`. */
function barreOrdinateur(): HTMLElement {
  return screen.getByTestId('filtres-ordinateur');
}

async function ouvrirFeuille(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: /^Filtres et tri/ }));
  return screen.findByRole('dialog', { name: 'Filtres et tri' });
}

/** Le dernier `?…` passé à `router.replace`, puis remise à zéro. */
function derniereUrl(): string {
  const appels = nav.replace.mock.calls;
  const url = appels.at(-1)?.[0] as string | undefined;
  nav.replace.mockClear();
  return url ?? '(aucun appel)';
}

/** Feuille ouverte, le reste de la page est inerte (dialogue modal) : on la referme d'abord. */
async function fermerFeuille(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

async function choisir(
  user: ReturnType<typeof userEvent.setup>,
  portee: HTMLElement,
  combobox: string,
  option: string,
) {
  await user.click(within(portee).getByRole('combobox', { name: combobox }));
  await user.click(await screen.findByRole('option', { name: option }));
}

describe('<PropertyListFilters> sur téléphone (TCK-644)', () => {
  beforeEach(() => {
    nav.params = new URLSearchParams();
    nav.replace.mockClear();
  });

  it('garde la recherche visible et range le reste derrière « Filtres », caché sous lg', () => {
    rendre();
    const recherche = screen.getByRole('searchbox', { name: 'Rechercher un bien' });
    // Aucun ancêtre de la recherche ne la cache sous `lg`.
    for (let n: HTMLElement | null = recherche; n; n = n.parentElement) {
      expect(n.className.split(/\s+/), n.outerHTML.slice(0, 120)).not.toContain('hidden');
    }
    // Le tri et les cases vivent dans la barre d'ordinateur, absente sous `lg`…
    const ordinateur = barreOrdinateur();
    expect(ordinateur.className.split(/\s+/)).toEqual(expect.arrayContaining(['hidden', 'lg:contents']));
    expect(within(ordinateur).getByRole('combobox', { name: 'Tri' })).toBeInTheDocument();
    // …et le bouton qui les rassemble n'existe QUE sous `lg`.
    const bouton = screen.getByRole('button', { name: /^Filtres et tri/ });
    expect(bouton.className.split(/\s+/)).toContain('lg:hidden');
    expect(within(bouton).getByText('Filtres')).toBeVisible();
  });

  it('compte les filtres actifs — ni la recherche (visible) ni le tri ne sont des filtres', () => {
    nav.params = new URLSearchParams(
      'search=villa&sort=price&status=available&only_mine=1&include_archived=1',
    );
    rendre();
    const bouton = screen.getByRole('button', { name: 'Filtres et tri — 3 filtres actifs' });
    expect(within(bouton).getByText('3')).toBeInTheDocument();
  });

  it('sans filtre, le bouton le dit et ne montre aucune pastille', () => {
    rendre();
    const bouton = screen.getByRole('button', { name: 'Filtres et tri — aucun filtre actif' });
    expect(within(bouton).queryByText('0')).toBeNull();
  });

  it('la feuille porte le tri, les deux cases et TOUS les filtres avancés', async () => {
    const user = userEvent.setup();
    rendre();
    const feuille = await ouvrirFeuille(user);
    for (const option of [
      'Plus récents',
      'Plus anciens',
      'Prix croissant',
      'Prix décroissant',
      'Vues décroissantes',
      'Vues croissantes',
    ]) {
      expect(within(feuille).getByRole('radio', { name: option })).toBeInTheDocument();
    }
    expect(within(feuille).getByRole('radio', { name: 'Plus récents' })).toBeChecked();
    expect(within(feuille).getByRole('checkbox', { name: 'Mes biens' })).toBeInTheDocument();
    expect(within(feuille).getByRole('checkbox', { name: 'Archivés' })).toBeInTheDocument();
    for (const nom of ['Ville', 'Prix minimum', 'Prix maximum']) {
      expect(within(feuille).getByRole('textbox', { name: nom })).toBeInTheDocument();
    }
    for (const nom of ['Statut', 'Type', 'Contrat', 'Visibilité', 'Agent assigné']) {
      expect(within(feuille).getByRole('combobox', { name: nom })).toBeInTheDocument();
    }
    expect(within(feuille).getAllByLabelText('Créé après').length).toBeGreaterThan(0);
    expect(within(feuille).getAllByLabelText('Créé avant').length).toBeGreaterThan(0);
  });

  it('AC2 — chaque commande de la feuille produit la MÊME URL que sa jumelle d’ordinateur', async () => {
    const user = userEvent.setup();
    rendre();
    const ordinateur = barreOrdinateur();

    // Tri
    await choisir(user, ordinateur, 'Tri', 'Prix croissant');
    const triOrdinateur = derniereUrl();
    let feuille = await ouvrirFeuille(user);
    await user.click(within(feuille).getByRole('radio', { name: 'Prix croissant' }));
    expect(derniereUrl()).toBe(triOrdinateur);
    expect(triOrdinateur).toBe('?sort=price');
    await fermerFeuille(user);

    // Les deux cases
    for (const [nom, attendu] of [
      ['Mes biens', '?only_mine=1'],
      ['Archivés', '?include_archived=1'],
    ] as const) {
      await user.click(within(ordinateur).getByRole('checkbox', { name: nom }));
      const depuisOrdinateur = derniereUrl();
      feuille = await ouvrirFeuille(user);
      await user.click(within(feuille).getByRole('checkbox', { name: nom }));
      expect(derniereUrl()).toBe(depuisOrdinateur);
      expect(depuisOrdinateur).toBe(attendu);
      await fermerFeuille(user);
    }

    // Les listes des filtres avancés : la barre d'ordinateur les déplie d'abord.
    await user.click(within(ordinateur).getByRole('button', { name: /Filtres avancés/ }));
    const avances = screen.getByTestId('filtres-avances-ordinateur');
    for (const [combobox, option, attendu] of [
      ['Statut', 'Disponible', '?status=available'],
      ['Type', 'Villa', '?type=villa'],
      ['Contrat', 'Location', '?contract_type=rent'],
      ['Visibilité', 'Privé', '?visibility=private'],
      ['Agent assigné', 'Awa Diop', '?user_id=8'],
    ] as const) {
      await choisir(user, avances, combobox, option);
      const depuisOrdinateur = derniereUrl();
      feuille = await ouvrirFeuille(user);
      await choisir(user, feuille, combobox, option);
      expect(derniereUrl(), combobox).toBe(depuisOrdinateur);
      expect(depuisOrdinateur, combobox).toBe(attendu);
      await fermerFeuille(user);
    }

    // Ville et prix : saisis, puis validés — « Appliquer » d'un côté, « Voir les résultats » de l'autre.
    await user.type(within(avances).getByRole('textbox', { name: 'Ville' }), 'Dakar');
    await user.type(within(avances).getByRole('textbox', { name: 'Prix minimum' }), '50000');
    await user.click(within(avances).getByRole('button', { name: 'Appliquer' }));
    const saisieOrdinateur = derniereUrl();
    feuille = await ouvrirFeuille(user);
    await user.type(within(feuille).getByRole('textbox', { name: 'Ville' }), 'Dakar');
    await user.type(within(feuille).getByRole('textbox', { name: 'Prix minimum' }), '50000');
    await user.click(within(feuille).getByRole('button', { name: 'Voir les résultats' }));
    expect(derniereUrl()).toBe(saisieOrdinateur);
    expect(saisieOrdinateur).toBe('?city=Dakar&price_min=50000');
    // « Voir les résultats » referme la feuille.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
