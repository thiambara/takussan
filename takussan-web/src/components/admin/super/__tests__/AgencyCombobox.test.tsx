import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { AgencyCombobox } from '../AgencyCombobox';

/**
 * TCK-363 — le sélecteur d'agence partagé.
 *
 * Les assertions portent sur des PROPRIÉTÉS que l'ancien comportement ne cochait pas :
 *
 * · le nombre de requêtes émises pour une saisie (AC3) — l'écran `/users` en émettait une par
 *   frappe, et rien ne le mesurait ;
 * · la sélection d'une agence classée **au-delà du 50ᵉ rang** (AC2) — un test qui choisirait
 *   parmi les vingt premières serait vert avec l'ancien `<Select>` peuplé de 50 agences, donc
 *   ne prouverait rien. Les deux tests ci-dessous choisissent explicitement la 63ᵉ, une fois par
 *   la recherche serveur, une fois par le chargement à la demande.
 */

/** Le catalogue de test : 63 agences, la dernière étant celle qu'aucune liste tronquée ne montre. */
const CATALOGUE = Array.from({ length: 63 }, (_, index) => ({
  id: index + 1,
  name: index === 62 ? 'Ziguinchor Habitat' : `Agence ${String(index + 1).padStart(2, '0')}`,
}));

const PER_PAGE = 20;

type AppelFetch = { url: URL };

/**
 * Sert `/api/super-admin/agencies` comme le backend : `filter[search]` filtre sur le nom, la
 * pagination est réelle. Rend l'espion pour compter les requêtes de RECHERCHE.
 */
function mockAgencies() {
  const appels: AppelFetch[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://localhost');
    appels.push({ url });

    // Le détail d'une agence — `/api/super-admin/agencies/{id}`.
    const detail = /\/api\/super-admin\/agencies\/(\d+)$/.exec(url.pathname);
    if (detail) {
      const agence = CATALOGUE.find((a) => a.id === Number(detail[1]));
      return { ok: true, json: async () => ({ data: agence }) };
    }

    const search = url.searchParams.get('filter[search]')?.toLowerCase() ?? '';
    const page = Number(url.searchParams.get('page') ?? '1');
    const trouvees = CATALOGUE.filter((a) => a.name.toLowerCase().includes(search));
    return {
      ok: true,
      json: async () => ({
        data: trouvees.slice((page - 1) * PER_PAGE, page * PER_PAGE),
        meta: {
          total: trouvees.length,
          current_page: page,
          last_page: Math.max(1, Math.ceil(trouvees.length / PER_PAGE)),
          per_page: PER_PAGE,
        },
      }),
    };
  });
  vi.stubGlobal('fetch', spy);
  return { spy, appels };
}

function renderCombobox(props: Partial<Parameters<typeof AgencyCombobox>[0]> = {}) {
  const onChange = props.onChange ?? vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <AgencyCombobox value={props.value ?? ''} onChange={onChange} label="Agence" />
      </QueryClientProvider>,
    ),
  );
  return { onChange };
}

/** Les requêtes de LISTE (donc de recherche), le détail d'une agence exclu. */
function requetesDeRecherche(appels: AppelFetch[]) {
  return appels.filter(({ url }) => url.pathname === '/api/super-admin/agencies');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('<AgencyCombobox>', () => {
  it("ne charge RIEN tant que le sélecteur n'est pas ouvert", async () => {
    const { appels } = mockAgencies();
    renderCombobox();

    // Laisser passer un tour de boucle : une requête au montage se verrait ici.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(requetesDeRecherche(appels)).toHaveLength(0);
  });

  it('une saisie de 10 caractères déclenche au plus 2 requêtes de recherche — AC3', async () => {
    const user = userEvent.setup();
    const { appels } = mockAgencies();
    renderCombobox();

    const champ = screen.getByLabelText('Agence');
    await user.click(champ);
    await waitFor(() => expect(requetesDeRecherche(appels).length).toBeGreaterThanOrEqual(1));

    // Dix caractères, frappés d'affilée. Sans anti-rebond, c'est dix requêtes.
    await user.type(champ, 'Ziguinchor');
    await waitFor(() =>
      expect(
        requetesDeRecherche(appels).some(
          ({ url }) => url.searchParams.get('filter[search]') === 'Ziguinchor',
        ),
      ).toBe(true),
    );

    expect(requetesDeRecherche(appels).length).toBeLessThanOrEqual(2);
  });

  it("affiche un état d'attente pendant la temporisation — AC4", async () => {
    const user = userEvent.setup();
    const { appels } = mockAgencies();
    renderCombobox();

    const champ = screen.getByLabelText('Agence');
    await user.click(champ);
    await waitFor(() => expect(requetesDeRecherche(appels).length).toBeGreaterThanOrEqual(1));
    await user.type(champ, 'Zig');

    // ⚠ L'assertion vaut par sa DATE : on est dans la fenêtre de temporisation, la requête pour
    // « Zig » n'est pas partie — c'est le seul moment où un indicateur branché sur le seul
    // `isFetching` laisserait l'interface muette. Sans le second `expect`, ce test resterait vert
    // avec un délai de 0 ms, donc sans rien prouver de l'AC.
    expect(
      requetesDeRecherche(appels).some(({ url }) => url.searchParams.get('filter[search]')),
    ).toBe(false);
    expect(screen.getByTestId('agency-combobox-pending')).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.queryByTestId('agency-combobox-pending')).not.toBeInTheDocument(),
    );
  });

  it('la 63ᵉ agence est sélectionnable PAR LA RECHERCHE — AC2', async () => {
    const user = userEvent.setup();
    const { appels } = mockAgencies();
    const { onChange } = renderCombobox();

    const champ = screen.getByLabelText('Agence');
    await user.click(champ);
    await user.type(champ, 'Ziguinchor');

    const option = await screen.findByRole('option', { name: 'Ziguinchor Habitat' });
    await user.click(option);

    // 63 : le rang exact de l'agence que les anciens sélecteurs, coupés à 50, ne montraient pas.
    expect(onChange).toHaveBeenCalledWith('63');
    expect(
      requetesDeRecherche(appels).some(
        ({ url }) => url.searchParams.get('filter[search]') === 'Ziguinchor',
      ),
    ).toBe(true);
  });

  it('la 63ᵉ agence est atteignable PAR LE CHARGEMENT À LA DEMANDE — AC2', async () => {
    const user = userEvent.setup();
    mockAgencies();
    const { onChange } = renderCombobox();

    await user.click(screen.getByLabelText('Agence'));
    await screen.findByRole('option', { name: 'Agence 01' });

    // La liste dit ce qu'elle montre — et ce qu'elle ne montre pas.
    expect(screen.getByText('20 sur 63')).toBeInTheDocument();

    // Trois pages de plus pour dépasser le 50ᵉ rang, puis le 63ᵉ.
    for (const attendu of ['40 sur 63', '60 sur 63', '63 sur 63']) {
      await user.click(screen.getByRole('button', { name: 'Afficher plus' }));
      await screen.findByText(attendu);
    }

    await user.click(await screen.findByRole('option', { name: 'Ziguinchor Habitat' }));
    expect(onChange).toHaveBeenCalledWith('63');
  });

  it("affiche le NOM de l'agence hydratée depuis l'URL, jamais son identifiant", async () => {
    mockAgencies();
    renderCombobox({ value: '63' });

    await waitFor(() =>
      expect(screen.getByLabelText('Agence')).toHaveValue('Ziguinchor Habitat'),
    );
  });

  /**
   * TCK-363, D4 — la contrainte STRICTE du ticket : « le sélecteur ne doit JAMAIS afficher une
   * liste tronquée sans le signaler ni permettre d'aller chercher plus loin ». Les deux chemins
   * d'ÉCHEC la violaient, et aucun des six tests ci-dessus ne les parcourait.
   *
   * L'assertion qui compte n'est pas « un message existe » mais « le popup n'est pas MUET » :
   * un sélecteur vide se lit « il n'y a pas d'agences », ce qui est pire qu'une troncature.
   */
  it("dit l'erreur et offre un réessai quand l'API échoue à l'OUVERTURE — D4a", async () => {
    const user = userEvent.setup();
    let enPanne = true;
    const spy = vi.fn(async () => {
      if (enPanne) return { ok: false, status: 500, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          data: CATALOGUE.slice(0, PER_PAGE),
          meta: { total: 63, current_page: 1, last_page: 4, per_page: PER_PAGE },
        }),
      };
    });
    vi.stubGlobal('fetch', spy);
    renderCombobox();

    await user.click(screen.getByLabelText('Agence'));

    // Le défaut mesuré : `document.body.textContent` valait la chaîne VIDE — ni erreur, ni
    // « aucun résultat » (le message est délibérément éteint sur ce chemin), ni réessai.
    const erreur = await screen.findByTestId('agency-combobox-error');
    expect(erreur).toHaveTextContent("La liste des agences n'a pas pu être chargée.");
    expect(screen.queryByText('Aucune agence ne correspond')).not.toBeInTheDocument();

    // Et le réessai n'est pas décoratif : il RECHARGE.
    enPanne = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByRole('option', { name: 'Agence 01' })).toBeInTheDocument();
    expect(screen.queryByTestId('agency-combobox-error')).not.toBeInTheDocument();
  });

  it("dit l'erreur quand la PAGE SUIVANTE échoue, et retire « Afficher plus » — D4b", async () => {
    const user = userEvent.setup();
    let page2EnPanne = true;
    const spy = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const page = Number(url.searchParams.get('page') ?? '1');
      if (page === 2 && page2EnPanne) return { ok: false, status: 503, json: async () => ({}) };
      return {
        ok: true,
        json: async () => ({
          data: CATALOGUE.slice((page - 1) * PER_PAGE, page * PER_PAGE),
          meta: { total: 63, current_page: page, last_page: 4, per_page: PER_PAGE },
        }),
      };
    });
    vi.stubGlobal('fetch', spy);
    renderCombobox();

    await user.click(screen.getByLabelText('Agence'));
    await screen.findByRole('option', { name: 'Agence 01' });
    expect(screen.getByText('20 sur 63')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Afficher plus' }));

    // Le défaut mesuré : « 20 sur 63 » restait figé, « Afficher plus » restait présent et devenait
    // INERTE, et rien n'était dit. L'utilisateur voyait qu'il manquait 43 agences sans moyen d'y
    // aller ni de comprendre pourquoi.
    await screen.findByTestId('agency-combobox-error');
    expect(screen.queryByRole('button', { name: 'Afficher plus' })).not.toBeInTheDocument();

    page2EnPanne = false;
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('40 sur 63')).toBeInTheDocument();
  });

  /**
   * TCK-363, D5 — un filtre ACTIF et INVISIBLE. Quand le détail de l'agence portée par l'URL
   * échoue, le champ retombait sur son placeholder « Toutes agences » alors que la liste EST
   * filtrée sur cette agence : le contraire de ce que l'AC2 garantit.
   */
  it("affiche l'identifiant, jamais « Toutes agences », quand le détail échoue — D5", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        if (/\/api\/super-admin\/agencies\/\d+$/.test(url.pathname)) {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        return {
          ok: true,
          json: async () => ({
            data: [],
            meta: { total: 0, current_page: 1, last_page: 1, per_page: PER_PAGE },
          }),
        };
      }),
    );
    renderCombobox({ value: '63' });

    const champ = screen.getByLabelText('Agence');
    await waitFor(() => expect(champ).toHaveValue('Agence #63'));
    // Le champ ne doit SURTOUT pas se lire « aucune agence choisie » sur un filtre posé.
    expect(champ).not.toHaveValue('');
  });
});
