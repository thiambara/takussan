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
});
