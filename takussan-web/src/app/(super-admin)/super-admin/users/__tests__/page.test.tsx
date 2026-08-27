import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
import SuperAdminUsersPage from '../page';

const mockReplace = vi.fn();
const mockPush = vi.fn();
const mockSearchParams = {
  get: vi.fn().mockReturnValue(null),
  toString: vi.fn().mockReturnValue(''),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  // `withIntl` charge le VRAI `fr.json` : depuis TCK-291, la page rend son état vide et son bloc
  // d'erreur via next-intl, et sans provider `useTranslations` LÈVE.
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <SuperAdminUsersPage />
      </QueryClientProvider>,
    ),
  );
}

function mockFetch(data: unknown[] = []) {
  const response = {
    ok: true,
    json: async () => ({
      data,
      meta: { total: 0, current_page: 1, last_page: 1 },
    }),
  };
  const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<typeof response>>(async () => response);
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockReplace.mockReset();
  mockPush.mockReset();
  mockSearchParams.get.mockReturnValue(null);
  mockSearchParams.toString.mockReturnValue('');
});

describe('super-admin users page', () => {
  it('requests only allowed user sparse fields', async () => {
    const spy = mockFetch();

    renderPage();

    await waitFor(() => expect(spy).toHaveBeenCalled());

    const url = new URL(String(spy.mock.calls[0][0]), 'http://localhost');
    const fields = url.searchParams.get('fields[users]')?.split(',') ?? [];

    expect(url.pathname).toBe('/api/super-admin-users');
    expect(fields).toEqual(expect.arrayContaining(['id', 'first_name', 'last_name', 'email', 'phone', 'status', 'email_verified_at', 'two_factor_enabled', 'last_login_at']));
    expect(fields).not.toContain('full_name');
    expect(fields).not.toContain('roles');
    expect(url.searchParams.get('include')).toBe('roles,agentProfiles,ownerProfiles');
  });

  /**
   * TCK-357 (AC4) — cet écran rendait une LISTE DE CARTES quand les dix autres listes de la
   * console étaient des tables, et le résumé du compte tenait dans une phrase interpolée
   * (« Statut : … · Email … · 2FA … »). Les assertions portent désormais sur la STRUCTURE de
   * table, pas sur cette phrase : c'est ce qui empêche un retour aux cartes de rester vert.
   */
  it('rend une TABLE — pas une liste de cartes — avec rôles, agences et sécurité', async () => {
    mockFetch([
      {
        id: 7,
        first_name: 'Awa',
        last_name: 'Ndiaye',
        full_name: 'Awa Ndiaye',
        email: 'awa@example.test',
        phone: '+221770000000',
        status: 'active',
        email_verified_at: '2026-05-01T10:00:00+00:00',
        two_factor_enabled: true,
        last_login_at: '2026-05-08T12:00:00+00:00',
        roles: [{ name: 'agent', team_id: 3 }],
        agencies: [{ id: 3, name: 'Dakar Immo', slug: 'dakar-immo' }],
      },
    ]);

    renderPage();

    expect(await screen.findByText('Awa Ndiaye')).toBeInTheDocument();

    const table = screen.getByRole('table');
    // La légende sr-only est la propriété que `DataTable` garantit et qu'aucune des onze tables
    // faites main ne portait : l'asserter ici la rend non régressable sur cet écran.
    expect(table).toHaveAccessibleName('Utilisateurs de la plateforme, toutes agences confondues');
    expect(
      within(table).getAllByRole('columnheader').map((th) => th.textContent),
    ).toEqual(['Utilisateur', 'Rôles', 'Agences', 'Statut', 'Sécurité', 'Dernière connexion', 'Actions']);

    const ligne = within(table).getAllByRole('row')[1];
    expect(within(ligne).getByText('agent')).toBeInTheDocument();
    expect(within(ligne).getByText('Dakar Immo')).toBeInTheDocument();
    expect(within(ligne).getByText('active')).toBeInTheDocument();
    // Les deux valeurs de sécurité portent leur PRÉFIXE : « vérifié » et « activée » nus ne
    // disent pas laquelle est l'email et laquelle le 2FA.
    expect(within(ligne).getByText('Email : vérifié')).toBeInTheDocument();
    expect(within(ligne).getByText('2FA : activée')).toBeInTheDocument();
  });

  /**
   * TCK-363 — l'écran ne demandait pas de CHOISIR une agence, il demandait d'en TAPER
   * l'identifiant numérique. Le test qui couvrait ce chemin (`getByPlaceholderText('ID agence')`
   * puis `type('12')`) décrivait donc le défaut. Ce qui le remplace se lit en deux temps : les
   * six filtres partent bien au serveur quand l'URL les porte, et le choix d'une agence s'écrit
   * dans l'URL par son NOM, jamais par une saisie manuelle.
   */
  it('envoie au serveur les six filtres portés par l’URL — TCK-363', async () => {
    const urlDeTest = new URLSearchParams({
      search: 'awa',
      role: 'agent',
      agency: '12',
      status: 'active',
      email: '1',
      twoFactor: '0',
      page: '3',
    });
    mockSearchParams.get.mockImplementation((key: string) => urlDeTest.get(key));
    mockSearchParams.toString.mockReturnValue(urlDeTest.toString());
    const spy = mockFetch();

    renderPage();
    await waitFor(() => expect(spy).toHaveBeenCalled());

    // ⚠ PAS `calls[0]` : le sélecteur d'agence, hydraté depuis `?agency=12`, émet lui aussi une
    // requête (le NOM de l'agence 12). On désigne donc la requête de liste par son chemin.
    const appel = spy.mock.calls.find(([input]) =>
      String(input).startsWith('/api/super-admin-users?'),
    );
    const url = new URL(String(appel?.[0]), 'http://localhost');
    expect(url.searchParams.get('filter[search]')).toBe('awa');
    expect(url.searchParams.get('filter[role]')).toBe('agent');
    expect(url.searchParams.get('filter[agency_id]')).toBe('12');
    expect(url.searchParams.get('filter[status]')).toBe('active');
    expect(url.searchParams.get('filter[email_verified]')).toBe('1');
    expect(url.searchParams.get('filter[two_factor_enabled]')).toBe('0');
    expect(url.searchParams.get('page')).toBe('3');
  });

  it('ne demande NULLE PART la saisie manuelle d’un identifiant d’agence — AC1 TCK-363', async () => {
    mockFetch();
    renderPage();

    await screen.findByLabelText('Agence');
    expect(screen.queryByPlaceholderText('ID agence')).not.toBeInTheDocument();
    // Le champ d'agence est une COMBOBOX cherchable, pas un champ numérique. Asserter le rôle
    // ARIA plutôt que l'absence du placeholder : un `<input type="number">` renommé cocherait
    // l'assertion précédente sans rien corriger.
    expect(screen.getByLabelText('Agence')).toHaveAttribute('role', 'combobox');
    expect(
      document.querySelectorAll('input[type="number"]').length,
    ).toBe(0);
  });

  it('choisir une agence écrit son identifiant dans l’URL — TCK-363', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (url.pathname === '/api/super-admin/agencies') {
          return {
            ok: true,
            json: async () => ({
              data: [{ id: 77, name: 'Ziguinchor Habitat' }],
              meta: { total: 1, current_page: 1, last_page: 1, per_page: 20 },
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({ data: [], meta: { total: 0, current_page: 1, last_page: 1 } }),
        };
      }),
    );

    renderPage();

    await user.click(screen.getByLabelText('Agence'));
    await user.click(await screen.findByRole('option', { name: 'Ziguinchor Habitat' }));

    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('agency=77'));
  });

  it('affiche le compte de résultats et vide l’URL à la réinitialisation — AC5 TCK-363', async () => {
    const user = userEvent.setup();
    mockSearchParams.get.mockImplementation((key: string) => (key === 'role' ? 'agent' : null));
    mockSearchParams.toString.mockReturnValue('role=agent');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [],
          meta: { total: 128, current_page: 1, last_page: 1 },
        }),
      })),
    );

    renderPage();

    expect(await screen.findByText('128 résultats')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Réinitialiser' }));
    // `?` et non `?role=agent` : la remise à zéro vide l'URL, elle ne retire pas un filtre.
    expect(mockReplace).toHaveBeenLastCalledWith('?');
  });

  it('« réinitialiser » est inerte tant qu’aucun filtre n’est posé — AC5 TCK-363', async () => {
    mockFetch();
    renderPage();

    expect(await screen.findByRole('button', { name: 'Réinitialiser' })).toBeDisabled();
  });

  /**
   * TCK-363, D3 — PERTE DE MERGE, côté TCK-360. Cet écran portait une amorce GARDÉE sur
   * `?status=` (« même amorce que role ci-dessus ») ; la résolution de conflit a gardé la lecture
   * d'URL et perdu la garde, pendant que `/agencies` conservait la sienne (`seedStatus()`). Les
   * deux écrans de la même console divergeaient, et rien ne le disait — TCK-360 n'avait écrit
   * aucun test pour `/users`, c'est ce qui a rendu la perte silencieuse.
   *
   * ⚠ Le test assère les DEUX conséquences, parce qu'elles se corrigent séparément : le jeton
   * inconnu ne part pas au serveur, ET il ne s'affiche pas brut à l'écran. Un correctif qui
   * n'aurait fermé que le premier laisserait « nawak » dans le déclencheur du `<Select>`.
   */
  it.each([
    ['status', 'nawak', 'filter[status]', 'Statut', 'Tous statuts'],
    ['role', 'sorcier', 'filter[role]', 'Rôle', 'Tous rôles'],
    ['email', '7', 'filter[email_verified]', 'Email vérifié', 'Email : tous'],
    ['twoFactor', 'peut-être', 'filter[two_factor_enabled]', '2FA', '2FA : tous'],
  ])(
    "un ?%s=%s hors vocabulaire retombe sur « tous » — D3 TCK-363 / TCK-360",
    async (cle, jeton, paramApi, aria, libelleAttendu) => {
      mockSearchParams.get.mockImplementation((k: string) => (k === cle ? jeton : null));
      mockSearchParams.toString.mockReturnValue(`${cle}=${encodeURIComponent(jeton)}`);
      const spy = mockFetch();

      renderPage();
      await waitFor(() => expect(spy).toHaveBeenCalled());

      const appel = spy.mock.calls.find(([input]) =>
        String(input).startsWith('/api/super-admin-users?'),
      );
      const url = new URL(String(appel?.[0]), 'http://localhost');
      // Un filtre inexistant côté serveur rend une liste vide inexplicable pour l'utilisateur.
      expect(url.searchParams.get(paramApi)).toBeNull();

      // Et le déclencheur rend le LIBELLÉ « tous », jamais le jeton brut non traduit.
      const declencheur = screen.getByLabelText(aria);
      expect(declencheur).toHaveTextContent(libelleAttendu);
      expect(declencheur.textContent).not.toContain(jeton);
    },
  );

  /**
   * TCK-363, D6 — trois MUTANTS SURVIVANTS sur l'AC5 : retirer `email` et `twoFactor` de
   * `PARAMS_DE_FILTRE` laissait 11/11 tests verts. Le code était juste, c'est la GARDE qui
   * manquait — et elle manquait sur les filtres que ce ticket introduit.
   *
   * Conséquence utilisateur de chaque oubli : le filtre est posé seul, `filtresPoses` est faux,
   * « Réinitialiser » est DÉSACTIVÉ — l'utilisateur ne peut plus lever d'un geste le filtre qu'il
   * vient de poser. Ne pas pouvoir atteindre l'action est pire que l'atteindre incomplètement.
   */
  it.each([
    ['search', 'awa'],
    ['role', 'agent'],
    ['agency', '12'],
    ['status', 'active'],
    ['email', '1'],
    ['twoFactor', '0'],
  ])('un ?%s= posé SEUL active « Réinitialiser » — AC5 D6 TCK-363', async (cle, valeur) => {
    mockSearchParams.get.mockImplementation((k: string) => (k === cle ? valeur : null));
    mockSearchParams.toString.mockReturnValue(`${cle}=${valeur}`);
    mockFetch();

    renderPage();

    expect(await screen.findByRole('button', { name: 'Réinitialiser' })).toBeEnabled();
  });

  /**
   * TCK-363, D7 — MUTANT SURVIVANT : supprimer entièrement le retour à la page 1 lors d'un
   * changement de filtre laissait 11/11 tests verts. Le défaut est classique et invisible — on
   * filtre depuis la page 7 et on croit qu'il n'y a pas de résultats. `/properties` le gardait
   * déjà (`expect(replaced).not.toContain('page=4')`) ; cet écran non, et l'écart était le signal.
   */
  it('changer un filtre depuis la page 7 revient à la page 1 — D7 TCK-363', async () => {
    const user = userEvent.setup();
    mockSearchParams.get.mockImplementation((k: string) => (k === 'page' ? '7' : null));
    mockSearchParams.toString.mockReturnValue('page=7');
    mockFetch();

    renderPage();

    await user.click(screen.getByLabelText('Rôle'));
    await user.click(await screen.findByRole('option', { name: 'Agent' }));

    const replaced = String(mockReplace.mock.calls.at(-1)?.[0]);
    expect(replaced).toContain('role=agent');
    expect(replaced).not.toContain('page=7');
  });

  /**
   * TCK-363, D8 — tranché en faveur de « le bouton est actif dès que le geste ferait quelque
   * chose ». Sur `?page=7` sans filtre, `reinitialiser()` ramène bien à la page 1 : un bouton
   * désactivé disait à l'utilisateur qu'il était déjà à l'état par défaut alors qu'il était
   * page 7.
   *
   * ⚠ La garde D6 ci-dessus reste porteuse malgré ce choix : ses six cas n'ont PAS de `page` dans
   * l'URL, donc un `PARAMS_DE_FILTRE` amputé les fait toujours rougir.
   */
  it('« réinitialiser » est actif sur ?page=7 sans aucun filtre — D8 TCK-363', async () => {
    mockSearchParams.get.mockImplementation((k: string) => (k === 'page' ? '7' : null));
    mockSearchParams.toString.mockReturnValue('page=7');
    mockFetch();

    renderPage();

    expect(await screen.findByRole('button', { name: 'Réinitialiser' })).toBeEnabled();
  });

  it('mirrors the role filter to the URL (?role=…) — AC3 TCK-243', async () => {
    const user = userEvent.setup();
    mockFetch();

    renderPage();

    await user.click(screen.getByLabelText('Rôle'));
    const agentOption = await screen.findByRole('option', { name: 'Agent' });
    await user.click(agentOption);

    expect(mockReplace).toHaveBeenCalledWith(expect.stringContaining('role=agent'));
  });

  it('hydrates the role filter from the URL on mount — AC3 TCK-243', async () => {
    mockSearchParams.get.mockImplementation((key: string) => (key === 'role' ? 'agent' : null));
    mockSearchParams.toString.mockReturnValue('role=agent');
    const spy = mockFetch();

    renderPage();

    await waitFor(() => expect(spy).toHaveBeenCalled());
    const url = new URL(String(spy.mock.calls[0][0]), 'http://localhost');
    expect(url.searchParams.get('filter[role]')).toBe('agent');
  });

  it('drops ?role from the URL when the role filter is cleared', async () => {
    const user = userEvent.setup();
    mockSearchParams.get.mockImplementation((key: string) => (key === 'role' ? 'agent' : null));
    mockSearchParams.toString.mockReturnValue('role=agent');
    mockFetch();

    renderPage();

    await user.click(screen.getByLabelText('Rôle'));
    const allRoles = await screen.findByRole('option', { name: 'Tous rôles' });
    await user.click(allRoles);

    expect(mockReplace).toHaveBeenCalled();
    const replaced = String(mockReplace.mock.calls.at(-1)?.[0]);
    expect(replaced).not.toContain('role=agent');
  });
  /**
   * TCK-292 (2026-08-22) — le chemin d'ERREUR n'était parcouru par AUCUN test, et c'est
   * exactement ce qui a laissé vivre le défaut : `fetchUsers` levait
   * `Object.assign(new Error('Users fetch failed'), …)`, un `Error` NU. `messageErreurApi` ne le
   * reconnaissait ni comme `ApiError`, ni comme forme technique (`/^API error \d+/`), ni comme
   * sentinelle de framework — il retombait donc dans « un `Error` nu transporte un message DÉJÀ
   * traduit » et rendait « Users fetch failed » TEL QUEL dans les trois langues. Le repli
   * `t('error')` n'était atteint par aucun chemin.
   *
   * Ce test-ci n'assère pas seulement le bon libellé : il refuse aussi la chaîne fautive, sans
   * quoi une régression qui rendrait les DEUX passerait au vert.
   */
  it("rend le libellé TRADUIT quand le BFF échoue — jamais le message anglais de l'Error", async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    })));

    renderPage();

    // Le libellé attendu vient du CODE d'erreur dérivé du 500 (`errors.api.serverError`), et non
    // du repli `t('error')` : c'est justement ce que `throw new ApiError(res.status, data)` rend
    // possible et qu'un `Error` nu rendait inatteignable.
    expect(
      await screen.findByText('Le serveur a rencontré une erreur. Réessayez dans un instant.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Users fetch failed/)).not.toBeInTheDocument();
    attendAucuneCleBrute(document.body);
  });
});
