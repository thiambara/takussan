import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { SuperAdminPropertiesFilters } from '../SuperAdminPropertiesFilters';

/**
 * TCK-292 — le composant résout ses libellés par `useTranslations`. `withIntl` monte le VRAI
 * `fr.json` : les assertions françaises sont donc mot pour mot celles de l'écran.
 *
 * TCK-363 — deux tests de ce fichier décrivaient l'ancien comportement et sont remplacés :
 *
 * · « renders the agency filter populated from props » : le sélecteur n'a plus de props
 *   d'agences. Il en recevait 50, chargées au montage de la page, et taisait le reste.
 * · « debounces search via form submit » : ce n'était pas une temporisation. La recherche ne
 *   partait qu'à la soumission du formulaire, c'est-à-dire à la touche Entrée — un geste que
 *   rien n'annonçait, et qu'un utilisateur qui clique ailleurs ne fait jamais.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────
 * TCK-478 — pourquoi la recherche ne se frappe plus par `await user.type`
 *
 * Le test « la recherche est TEMPORISÉE » portait le motif corrigé par TCK-451 dans
 * `console/__tests__/DebouncedSearchInput.test.tsx`, à l'identique : dix caractères frappés par
 * `await user.type`, puis `expect(mockReplace).not.toHaveBeenCalled()`. `user.type` cède la main
 * entre chaque caractère et `useDebouncedCallback.call` ré-arme la fenêtre à chacun : ce qui doit
 * rester sous les 300 ms n'est pas la frappe entière mais l'intervalle entre deux frappes, et un
 * seul décrochage au-dessus de 300 ms retourne l'assertion. Mesuré au repos le 2026-08-29 :
 * 2,9-4,6 ms d'intervalle, soit 65× à 103× — une marge de QUEUE, contre des facteurs de
 * contention de 11,6× à 16,7× mesurés par TCK-312.
 *
 * TCK-451 ferme la course en injectant `debounceMs = 60 000`, plus long que `testTimeout`. Cette
 * porte est inatteignable ici : ce fichier monte un ÉCRAN, et l'écran ne passe pas `debounceMs`
 * au champ — le lui faire passer contredirait l'invariant que la prop documente elle-même
 * (`grep -rn 'debounceMs=' src` doit rendre les seuls fichiers de test, le délai étant un
 * arbitrage de produit et non un réglage d'appelant).
 *
 * D'où {@link frappe} : dix `fireEvent.change` dans une seule et même tâche, sans un `await`
 * entre eux — le patron déjà éprouvé de `search/__tests__/FilterSidebar.test.tsx` (TCK-335).
 * Aucune macro-tâche ne s'intercale, donc aucun `setTimeout` ne peut échoir pendant la frappe,
 * quelle que soit la charge. La fenêtre est ensuite faite échoir par le `blur`, qui est le
 * chemin de production (`onBlur={() => commit.flush()}`) et qui est SYNCHRONE : l'attente non
 * bornée qui suivait ne se borne pas, elle disparaît.
 *
 * ⚠ Que la fenêtre échoie TOUTE SEULE reste prouvé, mais ailleurs : `DebouncedSearchInput.test
 * .tsx` porte ce test-là. Ce fichier-ci ne le portait pas davantage avant le correctif — son
 * `waitFor` attendait un commit, pas la preuve qu'il partait sans geste.
 * ────────────────────────────────────────────────────────────────────────────────────────────
 */

/**
 * La borne locale de la seule attente de ce fichier qui paie l'horloge réelle : celle du
 * sélecteur d'agence, dont la recherche est temporisée à 300 ms puis suivie d'un `fetch`.
 *
 * 10 000 ms — la valeur retenue par TCK-451 pour la même fenêtre : marge de 33× sur les
 * 300,6-307,3 ms mesurés au repos le 2026-08-29, et 2,5× sur le pire cas observé sous contention
 * (4032 ms). Le défaut global (`asyncUtilTimeout` = 3000 ms, TCK-313) n'offre qu'un facteur 10 —
 * moins que les facteurs de contention 11,6-16,7× de TCK-312 — et vit dans un autre fichier,
 * qu'un autre ticket peut resserrer sans voir celui-ci. La borne reste sous `testTimeout` (20 s)
 * pour que l'échec soit une assertion lisible et non un « Test timed out ».
 */
const BUDGET_DES_ATTENTES_REELLES = 10_000;

/**
 * Frappe SANS céder la main : un `change` par caractère, tous dans la même tâche (TCK-478).
 *
 * Le champ ne lit que `onChange` et `onBlur` : ce que cette frappe lui montre est exactement ce
 * que `user.type` lui montrait, à ceci près qu'aucun `setTimeout` ne peut s'intercaler.
 */
function frappe(champ: HTMLElement, texte: string) {
  for (let i = 1; i <= texte.length; i += 1) {
    fireEvent.change(champ, { target: { value: texte.slice(0, i) } });
  }
}

const mockReplace = vi.fn();
const mockSearchParams = {
  get: vi.fn().mockReturnValue(null),
  toString: vi.fn().mockReturnValue(''),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

/** 63 agences : la 63ᵉ n'est atteignable par aucune liste coupée à 50. */
const CATALOGUE = Array.from({ length: 63 }, (_, index) => ({
  id: index + 1,
  name: index === 62 ? 'Ziguinchor Habitat' : `Agence ${String(index + 1).padStart(2, '0')}`,
}));

function mockAgencies() {
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    const search = url.searchParams.get('filter[search]')?.toLowerCase() ?? '';
    const trouvees = CATALOGUE.filter((a) => a.name.toLowerCase().includes(search));
    return {
      ok: true,
      json: async () => ({
        data: trouvees.slice(0, 20),
        meta: { total: trouvees.length, current_page: 1, last_page: 1, per_page: 20 },
      }),
    };
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

function renderFilters(props: { total?: number; busy?: boolean } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <SuperAdminPropertiesFilters {...props} />
      </QueryClientProvider>,
    ),
  );
}

describe('<SuperAdminPropertiesFilters>', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSearchParams.get.mockReturnValue(null);
    mockSearchParams.toString.mockReturnValue('');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('la 63ᵉ agence est sélectionnable et s’écrit dans l’URL — AC2 TCK-363', async () => {
    const user = userEvent.setup();
    mockAgencies();
    renderFilters();

    const champ = screen.getByLabelText('Agence');
    await user.click(champ);
    await user.type(champ, 'Ziguinchor');

    // Borne locale (TCK-478) : cette attente-ci est réelle — 300 ms d'anti-rebond du sélecteur
    // d'agence, puis un `fetch`. Le budget global de 3000 ms ne lui laissait qu'un facteur 10.
    await user.click(
      await screen.findByRole(
        'option',
        { name: 'Ziguinchor Habitat' },
        { timeout: BUDGET_DES_ATTENTES_REELLES },
      ),
    );

    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining('filter%5Bagency_id%5D=63'),
    );
  });

  it('resets pagination when changing a filter', async () => {
    const user = userEvent.setup();
    mockAgencies();
    mockSearchParams.toString.mockReturnValue('page=4');
    renderFilters();

    await user.click(screen.getByLabelText('Statut'));
    const option = await screen.findByRole('option', { name: 'Disponible' });
    await user.click(option);

    expect(mockReplace).toHaveBeenCalled();
    const replaced = String(mockReplace.mock.calls[0][0]);
    expect(replaced).not.toContain('page=4');
    expect(replaced).toContain('filter%5Bstatus%5D=available');
  });

  it('la recherche est TEMPORISÉE : 10 caractères n’écrivent l’URL qu’une fois — AC3 TCK-363', () => {
    mockAgencies();
    renderFilters();

    const champ = screen.getByLabelText('Rechercher un bien');
    frappe(champ, 'appartemen'); // 10 caractères, sans céder la main une seule fois

    // Rien n'est encore parti : on est dans la fenêtre de temporisation.
    expect(mockReplace).not.toHaveBeenCalled();
    // Et l'interface n'est pas muette pour autant (AC4).
    expect(screen.getByTestId('console-search-pending')).toBeInTheDocument();

    // La fenêtre échoit MAINTENANT, par le geste de l'utilisateur qui quitte le champ ; `flush()`
    // est synchrone, donc il n'y a plus d'attente à borner (TCK-478).
    fireEvent.blur(champ);

    // ⚠ Le test disait « ≤ 2 » : la borne haute était une prudence rendue nécessaire par le
    // `waitFor` qu'il portait — on ne savait pas COMBIEN de fenêtres avaient échu pendant la
    // frappe. Le commit étant désormais déclenché par un geste unique et synchrone, le compte
    // est exact, et c'est lui qui distingue « temporisé » de « une écriture par caractère »
    // (TCK-478).
    expect(mockReplace).toHaveBeenCalledTimes(1);
    expect(String(mockReplace.mock.calls.at(-1)?.[0])).toContain(
      'filter%5Bsearch%5D=appartemen',
    );
  });

  it('affiche le compte de résultats et vide l’URL à la réinitialisation — AC5 TCK-363', async () => {
    const user = userEvent.setup();
    mockAgencies();
    mockSearchParams.get.mockImplementation((key: string) =>
      key === 'filter[status]' ? 'available' : null,
    );
    mockSearchParams.toString.mockReturnValue('filter%5Bstatus%5D=available');
    renderFilters({ total: 128 });

    expect(screen.getByText('128 résultats')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    expect(mockReplace).toHaveBeenLastCalledWith('?');
  });

  it('« réinitialiser » est inerte tant qu’aucun filtre n’est posé — AC5 TCK-363', () => {
    mockAgencies();
    renderFilters({ total: 0 });

    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeDisabled();
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });

  /**
   * TCK-363, D6 — MUTANT SURVIVANT : retirer `filter[agency_id]` de `PARAMS_DE_FILTRE` laissait
   * 5/5 tests verts, alors que c'est le filtre que ce ticket introduit ici. L'agence posée seule,
   * « Réinitialiser » désactivé : le geste qui lève le filtre devient inatteignable.
   */
  it.each([
    ['filter[search]', 'villa'],
    ['filter[status]', 'available'],
    ['filter[type]', 'apartment'],
    ['filter[visibility]', 'public'],
    ['filter[agency_id]', '63'],
  ])('un %s posé SEUL active « Réinitialiser » — AC5 D6 TCK-363', (cle, valeur) => {
    mockAgencies();
    mockSearchParams.get.mockImplementation((k: string) => (k === cle ? valeur : null));
    renderFilters({ total: 3 });

    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeEnabled();
  });

  /** TCK-363, D8 — la remise à zéro vide l'URL, pagination comprise : le bouton doit le dire. */
  it('« réinitialiser » est actif sur ?page=4 sans aucun filtre — D8 TCK-363', () => {
    mockAgencies();
    mockSearchParams.get.mockImplementation((k: string) => (k === 'page' ? '4' : null));
    renderFilters({ total: 3 });

    expect(screen.getByRole('button', { name: 'Réinitialiser' })).toBeEnabled();
  });
});
