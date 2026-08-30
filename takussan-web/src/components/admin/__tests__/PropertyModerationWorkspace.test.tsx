import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { PropertyModerationWorkspace } from '../PropertyModerationWorkspace';

/**
 * TCK-376 — la file de validation des biens : état partageable, pagination, recherche temporisée.
 *
 * L'écran n'avait aucun test. Trois défauts mesurés le 2026-08-27 sur `origin/dev` :
 * la requête ne portait pas de `page` (une file longue avait une fin inatteignable), la
 * recherche vivait en `useState` (perdue au rechargement, absente d'un lien partagé), et elle
 * partait à chaque frappe.
 */

/**
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-478 — pourquoi ce fichier ne PARIE plus sur l'ordonnancement
 *
 * Le test « AC3 — dix caractères saisis n'écrivent l'URL qu'une fois » portait, mot pour mot, le
 * motif que TCK-451 a corrigé dans `console/__tests__/DebouncedSearchInput.test.tsx` — jusqu'au
 * mot de dix lettres : une frappe par `await user.type`, puis une assertion NÉGATIVE
 * (`expect(replace).not.toHaveBeenCalled()`).
 *
 * `user.type` cède la main entre chaque caractère, et `useDebouncedCallback.call` RÉ-ARME la
 * fenêtre à chaque caractère. Ce qui doit rester sous les 300 ms n'est donc pas la durée de la
 * frappe entière, mais l'INTERVALLE entre deux frappes consécutives : un seul décrochage
 * d'ordonnancement au-dessus de 300 ms, où qu'il tombe, fait partir le commit pendant la frappe
 * et retourne l'assertion. Marge mesurée au repos le 2026-08-29 : 2,9-4,6 ms, soit 65× à 103×.
 * C'est une grandeur de QUEUE — TCK-312 a mesuré des facteurs de contention de 11,6× à 16,7× sur
 * les tests d'interaction, et TCK-451 a vu le rouge arriver sous `load average` 240.
 *
 * ## Ce qui est repris de TCK-451, et le seul point où ce fichier s'en écarte
 *
 * Repris : la grandeur défendue n'est plus une marge d'horloge mais une IMPOSSIBILITÉ ; la
 * fenêtre est ensuite faite échoir par le test LUI-MÊME, au `blur` — c'est-à-dire par le chemin
 * de production (`onBlur={() => commit.flush()}`) et non par une trappe de test ; la constante
 * de production ne bouge pas ; et l'attente non bornée qui suivait la frappe disparaît avec la
 * course, au lieu d'être seulement élargie.
 *
 * Écart : TCK-451 obtient l'impossibilité en INJECTANT `debounceMs = 60 000`, une fenêtre plus
 * longue que `testTimeout`. **Cette porte est inatteignable ici** : ce test monte un ÉCRAN, et
 * l'écran ne passe pas `debounceMs` au champ. Le lui faire passer contredirait l'invariant que
 * la prop elle-même documente — `grep -rn 'debounceMs=' src` doit rendre les seuls fichiers de
 * test, parce que le délai subi par l'utilisateur est un arbitrage de PRODUIT et non un réglage
 * d'appelant. Corriger la course en ouvrant ce réglage aux écrans reviendrait à payer le
 * correctif avec l'invariant qu'il est censé préserver.
 *
 * D'où {@link frappe}, qui est l'autre patron déjà éprouvé du dépôt pour exactement ce cas
 * (`search/__tests__/FilterSidebar.test.tsx`, TCK-335) : dix `fireEvent.change` consécutifs, sans
 * un seul `await` entre eux. Aucune macro-tâche ne s'intercale, donc aucun `setTimeout` ne PEUT
 * échoir pendant la frappe, quelle que soit la charge de la machine. La défense y gagne : là où
 * « 60 000 ms contre 20 000 ms » est un rapport, ceci est une propriété du fil d'exécution.
 *
 * ⚠ Ce que ce fichier ne prouve plus, et où c'est prouvé : que la fenêtre échoit TOUTE SEULE.
 * `DebouncedSearchInput.test.tsx` porte ce test-là nommément, et ici « AC3 — chercher depuis la
 * page 7 » le paie encore sur l'horloge réelle — d'où {@link BUDGET_DES_ATTENTES_REELLES}.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * Frappe SANS céder la main : dix `change` dans une seule et même tâche.
 *
 * `await user.type()` insère un point d'ordonnancement entre chaque caractère ; c'est là, et
 * nulle part ailleurs, que la fenêtre d'anti-rebond peut échoir sous charge. Ici il n'y a rien
 * entre les caractères — pas même une micro-tâche — donc l'assertion « rien n'est encore parti »
 * ne dépend plus d'aucune marge (TCK-478).
 *
 * Le composant ne lit que `onChange` et `onBlur` : ce que cette frappe lui montre est exactement
 * ce que `user.type` lui montrait.
 */
function frappe(champ: HTMLElement, texte: string) {
  for (let i = 1; i <= texte.length; i += 1) {
    fireEvent.change(champ, { target: { value: texte.slice(0, i) } });
  }
}

/**
 * La borne locale des attentes qui restent sur l'horloge réelle (TCK-478).
 *
 * 10 000 ms — la valeur que TCK-451 a retenue pour cette même fenêtre de 300 ms : marge de 33×
 * sur les 300,6-307,3 ms mesurés au repos le 2026-08-29, et 2,5× sur le pire cas jamais observé
 * sous contention (4032 ms). Le défaut GLOBAL — `asyncUtilTimeout` à 3000 ms (TCK-313) — n'offre
 * qu'un facteur 10, c'est-à-dire moins que les facteurs de contention 11,6-16,7× de TCK-312 ;
 * et il appartient à un autre fichier, qu'un autre ticket peut resserrer sans voir celui-ci.
 * La borne reste au-dessous de `testTimeout` (20 s) pour que l'échec soit une assertion lisible
 * plutôt qu'un « Test timed out » qui n'apprend rien.
 */
const BUDGET_DES_ATTENTES_REELLES = 10_000;

const mockFetchQueue = vi.fn();

vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: (...args: unknown[]) => mockFetchQueue(...args),
  approveProperty: vi.fn(),
  rejectProperty: vi.fn(),
  resubmitProperty: vi.fn(),
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: null, token: 'fake-token', isLoading: false }),
}));

let urlCourante = '';
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(urlCourante),
}));

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function makeProperty(overrides: Partial<{ id: number; title: string }> = {}) {
  return {
    id: overrides.id ?? 1,
    reference_number: `REF-${overrides.id ?? 1}`,
    title: overrides.title ?? 'Villa à Saly',
    slug: 'villa-saly',
    status: 'pending',
    main_photo_url: null,
    price: 45_000_000,
    currency: 'XOF',
    type: 'villa',
    submitted_at: '2026-08-01T10:00:00Z',
    rejection_reason: null,
    owner: { id: 3, name: 'Awa Diop', avatar_url: null },
    agency: { id: 7, name: 'Teranga Immo' },
    location: { city: 'Saly', region: 'Thiès', country: 'SN' },
  };
}

function reponse(overrides: Partial<{ last_page: number; current_page: number }> = {}, data = [
  makeProperty({ id: 1, title: 'Villa à Saly' }),
  makeProperty({ id: 2, title: 'Duplex à Dakar' }),
]) {
  return {
    data,
    meta: {
      total: 2,
      current_page: overrides.current_page ?? 1,
      last_page: overrides.last_page ?? 1,
      per_page: 20,
      pending_count: 2,
    },
    links: { first: null, last: null, prev: null, next: null },
  };
}

function derniereUrl(): URLSearchParams {
  const appel = replace.mock.calls.at(-1);
  if (!appel) throw new Error('router.replace n’a pas été appelé');
  return new URLSearchParams(String(appel[0]).replace(/^\?/, ''));
}

function derniersParams() {
  const appel = mockFetchQueue.mock.calls.at(-1);
  if (!appel) throw new Error('fetchPropertyModerationQueue n’a pas été appelé');
  return appel[1] as Record<string, unknown>;
}

describe('<PropertyModerationWorkspace> (TCK-376)', () => {
  beforeEach(() => {
    urlCourante = '';
    replace.mockReset();
    mockFetchQueue.mockReset();
    mockFetchQueue.mockResolvedValue(reponse({ last_page: 3 }));
  });

  // ─── AC1 — un lien copié rouvre LA MÊME file ───────────────────────────────────────────────
  it('AC1 — rejoue la recherche et la page portées par l’URL', async () => {
    urlCourante = 'filter[search]=Saly&page=2';
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    expect(derniersParams()).toEqual({ search: 'Saly', page: 2, perPage: 20 });
    // Le champ affiche ce que l'URL porte — un lien collé n'ouvre pas une barre vide.
    expect(screen.getByRole('searchbox')).toHaveValue('Saly');
  });

  it('AC1 — n’envoie aucune recherche quand l’URL est nue', async () => {
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');
    expect(derniersParams()).toEqual({ search: undefined, page: 1, perPage: 20 });
  });

  it('AC1 — la sélection est portée par l’URL, et le clic l’y écrit', async () => {
    urlCourante = 'selected=2';
    render(wrap(<PropertyModerationWorkspace />));

    // Le panneau de détail ouvre le bien DÉSIGNÉ, pas le premier de la file.
    expect(await screen.findByTestId('property-moderation-detail')).toHaveTextContent('Duplex à Dakar');

    const user = userEvent.setup();
    await user.click(screen.getByTestId('property-queue-item-1').querySelector('button')!);
    expect(derniereUrl().get('selected')).toBe('1');
  });

  // ─── AC2 — parcourable jusqu'à la dernière page ────────────────────────────────────────────
  it('AC2 — « Suivant » avance d’une page, et la page part au serveur', async () => {
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /suivant/i }));
    expect(derniereUrl().get('page')).toBe('2');

    urlCourante = 'page=2';
    mockFetchQueue.mockClear();
    render(wrap(<PropertyModerationWorkspace />));
    await waitFor(() => expect(mockFetchQueue).toHaveBeenCalled(), {
      timeout: BUDGET_DES_ATTENTES_REELLES,
    });
    expect(derniersParams().page).toBe(2);
  });

  it('AC2 — la dernière page est atteignable, et « Suivant » y est inerte', async () => {
    urlCourante = 'page=3';
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    expect(screen.getByText('Page 3 sur 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /suivant/i })).toBeDisabled();
  });

  it('AC2 — une file d’une seule page ne rend aucune pagination', async () => {
    mockFetchQueue.mockResolvedValue(reponse({ last_page: 1 }));
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  /**
   * AC2, la moitié que les tests d'origine ne parcouraient pas — relevée par la revue adverse.
   *
   * Ils n'exerçaient qu'une file PEUPLÉE. La pagination était rendue à l'intérieur de la branche
   * « la liste n'est pas vide » : on modère les trois dernières lignes de la page 4, la file
   * retombe à trois pages, et l'écran affichait « aucun bien à valider » sans aucun contrôle de
   * pagination — donc sans chemin de retour hors édition de l'URL. Un cul-de-sac sur un écran de
   * travail à la chaîne, et un état vide qui MENT : ce n'est pas la file qui est vide, c'est la
   * page qui n'existe plus.
   */
  it('AC2 — une page devenue vide garde sa pagination : « Précédent » ramène dans la file', async () => {
    // La file a été traitée jusqu'à ne plus tenir que sur 3 pages ; l'URL est restée sur la 4e.
    urlCourante = 'page=4';
    mockFetchQueue.mockResolvedValue(reponse({ last_page: 3, current_page: 4 }, []));
    render(wrap(<PropertyModerationWorkspace />));

    // L'état vide est là — il est juste, la PAGE est vide.
    expect(await screen.findByText('Aucun bien à valider')).toBeInTheDocument();

    // ...et la sortie aussi.
    const nav = screen.getByRole('navigation', { name: 'Pagination' });
    expect(nav).toBeInTheDocument();
    const precedent = screen.getByRole('button', { name: /précédent/i });
    expect(precedent).toBeEnabled();

    const user = userEvent.setup();
    await user.click(precedent);
    // Bornée à `lastPage` : le clic ne ramène pas sur une 3e page inexistante mais sur la
    // dernière qui existe.
    expect(derniereUrl().get('page')).toBe('3');
  });

  it('AC2 — une file ENTIÈREMENT vide ne rend pas de pagination : toutes les pages le sont', async () => {
    urlCourante = 'page=4';
    mockFetchQueue.mockResolvedValue(reponse({ last_page: 1, current_page: 4 }, []));
    render(wrap(<PropertyModerationWorkspace />));

    expect(await screen.findByText('Aucun bien à valider')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Pagination' })).not.toBeInTheDocument();
  });

  // ─── AC3 — la recherche est temporisée, et le filtre est SERVEUR ───────────────────────────
  it('AC3 — dix caractères saisis n’écrivent l’URL qu’une fois', async () => {
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    const champ = screen.getByRole('searchbox');
    frappe(champ, 'Ziguinchor'); // 10 caractères, sans céder la main une seule fois

    // Rien n'est encore parti, et l'attente se voit — les deux ensemble : la seconde assertion
    // seule serait verte avec une temporisation de 0 ms.
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByTestId('console-search-pending')).toBeInTheDocument();

    // La fenêtre échoit MAINTENANT, par le seul geste qu'a l'utilisateur : quitter le champ.
    // `onBlur={() => commit.flush()}` est synchrone — il n'y a plus rien à attendre, donc plus
    // d'attente à borner (TCK-478).
    fireEvent.blur(champ);

    expect(replace).toHaveBeenCalledTimes(1);
    expect(derniereUrl().get('filter[search]')).toBe('Ziguinchor');
  });

  it('AC3 — chercher depuis la page 7 retourne à la page 1', async () => {
    urlCourante = 'page=7';
    render(wrap(<PropertyModerationWorkspace />));
    await screen.findByTestId('property-queue-item-1');

    // ⚠ Celui-ci garde délibérément `user.type` et l'horloge RÉELLE : c'est le seul test de ce
    // fichier qui prouve que la fenêtre échoit TOUTE SEULE, au niveau de l'écran. Il n'a aucune
    // assertion négative — rien à retourner si la fenêtre échoit tôt — donc le motif de TCK-451
    // ne s'y applique pas ; ce qu'il lui fallait, c'est une borne locale (TCK-478).
    const user = userEvent.setup();
    await user.type(screen.getByRole('searchbox'), 'Saly');
    await waitFor(() => expect(replace).toHaveBeenCalled(), {
      timeout: BUDGET_DES_ATTENTES_REELLES,
    });

    expect(derniereUrl().has('page')).toBe(false);
  });

  it('le filtre part au SERVEUR — la liste rendue n’est jamais filtrée en mémoire', async () => {
    // Le serveur rend délibérément un bien qui ne contient PAS le mot cherché : si l'écran
    // filtrait la liste rapatriée, il l'aurait masqué.
    urlCourante = 'filter[search]=introuvable';
    render(wrap(<PropertyModerationWorkspace />));

    expect(await screen.findByTestId('property-queue-item-1')).toHaveTextContent('Villa à Saly');
    expect(derniersParams().search).toBe('introuvable');
  });
});
