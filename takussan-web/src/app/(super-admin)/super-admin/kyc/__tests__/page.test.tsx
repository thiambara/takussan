/**
 * TCK-362 — la file KYC doit se VIDER depuis la file.
 *
 * Ce que ces tests refusent de laisser revenir, et qui était l'état de l'écran au 2026-08-27 :
 * chaque ligne affichait « Agence #12 » (l'identifiant technique en guise de nom), et le seul
 * bouton de la ligne était un `<Link>` vers la fiche agence. Décider demandait donc de quitter la
 * file, de décider ailleurs, puis d'y revenir.
 *
 * Les assertions portent sur ce que l'opérateur VOIT et sur ce qui PART sur le réseau — jamais sur
 * la présence d'un composant. Un panneau monté qui n'appellerait pas l'API cocherait un test de
 * présence et ne viderait aucune file.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
import { REPLI_SUJET_TESTID } from '@/components/admin/super/kyc-queue';
import { queueCountQueryOptions } from '@/lib/queries/super-admin-queues';
import SuperAdminKycPage from '../page';

const mockReplace = vi.fn();
const parametres = new Map<string, string>();
const mockSearchParams = {
  get: (cle: string) => parametres.get(cle) ?? null,
  toString: () => new URLSearchParams([...parametres]).toString(),
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace, push: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

function dossier(surcharge: Record<string, unknown> = {}) {
  return {
    id: 41,
    subject_type: 'Agency',
    subject_id: 12,
    subject: { id: 12, type: 'Agency', name: 'Dakar Immo Sarl', slug: 'dakar-immo' },
    status: 'submitted',
    submitted_at: '2026-08-20T09:00:00+00:00',
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,
    metadata: {},
    documents: [
      { id: 1, file_name: 'rccm.pdf', mime_type: 'application/pdf', size: 10, document_type: 'rccm', signed_url: 'https://x.test/1', expires_at: '2026-08-27T10:00:00+00:00' },
      { id: 2, file_name: 'ninea.pdf', mime_type: 'application/pdf', size: 10, document_type: 'ninea', signed_url: 'https://x.test/2', expires_at: '2026-08-27T10:00:00+00:00' },
      { id: 3, file_name: 'director.pdf', mime_type: 'application/pdf', size: 10, document_type: 'director_id', signed_url: 'https://x.test/3', expires_at: '2026-08-27T10:00:00+00:00' },
    ],
    created_at: '2026-08-19T09:00:00+00:00',
    updated_at: '2026-08-20T09:00:00+00:00',
    ...surcharge,
  };
}

type Appel = { url: string; init?: RequestInit };

/**
 * Le faux `fetch` distingue la file de la DÉCISION par la méthode : `postKycReview` fait un POST,
 * les deux lectures un GET. Distinguer par l'URL aurait marché aussi — mais c'est la méthode qui
 * porte le sens, et un jour où le chemin bougera ce test n'aura pas à bouger avec.
 */
function mockFetch(
  dossiers: unknown[] = [],
  total = dossiers.length,
  refusDuPost?: { status: number; body: unknown },
) {
  const appels: Appel[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    appels.push({ url: String(input), init });
    if (init?.method === 'POST' && refusDuPost) {
      return { ok: false, status: refusDuPost.status, json: async () => refusDuPost.body };
    }
    return {
      ok: true,
      status: 200,
      json: async () =>
        init?.method === 'POST'
          ? { data: dossier({ status: 'verified' }) }
          : { data: dossiers, meta: { total, current_page: 1, last_page: 1, per_page: 20 } },
    };
  });
  vi.stubGlobal('fetch', spy);
  return { spy, appels };
}

/**
 * La valeur affichée par la tuile `StatCard` portant ce libellé.
 *
 * `StatCard` ne pose aucun `data-testid` : sa forme est « un `<p>` de libellé dans un en-tête
 * flex, puis un `<p>` de valeur ». On remonte donc du libellé, une fois ici plutôt que dans
 * chaque test — s'il faut corriger le jour où la tuile change de forme, ce sera à un endroit.
 */
function tuile(libelle: string): HTMLElement {
  return screen.getByText(libelle).parentElement!.parentElement!;
}

/**
 * Le badge de file de `SuperAdminSidebar`, réduit à ce qui compte ici : SA CLÉ DE CACHE.
 *
 * On ne monte pas la vraie barre latérale — elle demande le contexte d'auth, le routeur et les
 * trois autres files. On monte ce qui, dans la barre latérale, doit se rendre au MÊME point de
 * rendez-vous que la tuile de la page : `queueCountQueryOptions('kyc-pending')` (TCK-360). Si la
 * page redéclare une clé à elle, ce composant et la tuile deviennent deux requêtes et deux
 * caches — c'est exactement ce que le test ci-dessous refuse.
 */
function BadgeBarreLaterale() {
  const compte = useQuery(queueCountQueryOptions('kyc-pending'));
  return <span data-testid="badge-barre-laterale">{compte.data ?? '—'}</span>;
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={queryClient}>
        <SuperAdminKycPage />
      </QueryClientProvider>,
    ),
  );
}

const posts = (appels: Appel[]) => appels.filter((appel) => appel.init?.method === 'POST');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  mockReplace.mockReset();
  parametres.clear();
});

describe('file KYC super-admin', () => {
  it('demande le sujet en UN include et affiche le NOM de l’agence, pas son identifiant', async () => {
    const { appels } = mockFetch([dossier()]);

    renderPage();

    expect(await screen.findByText('Dakar Immo Sarl')).toBeInTheDocument();

    const url = new URL(appels[0].url, 'http://localhost');
    expect(url.pathname).toBe('/api/super-admin/kyc');
    expect(url.searchParams.get('include')).toBe('subject');
    expect(url.searchParams.get('filter[status]')).toBe('submitted');

    /*
     * AC2 — sur le MARQUEUR de repli, et non sur une forme de libellé.
     *
     * La première version de cette assertion cherchait `/Agence #\d+/`. Elle était plus faible
     * qu'elle n'en avait l'air : elle ne matchait ni « Agence supprimée (#12) » ni « User #7 »,
     * donc un écran entièrement retombé en repli l'aurait laissée verte. `REPLI_SUJET_TESTID` est
     * posé par `nomDuSujet` sur TOUT repli, présent et à venir — c'est la propriété, pas une de
     * ses apparences. La regex reste en second : elle nomme la forme d'AVANT le ticket, qui est
     * celle qu'on refuse en particulier.
     */
    expect(screen.queryAllByTestId(REPLI_SUJET_TESTID)).toHaveLength(0);
    expect(screen.queryByText(/Agence #\d+/)).not.toBeInTheDocument();
    attendAucuneCleBrute();
  });

  it('retombe sur l’identifiant seulement quand le sujet a disparu', async () => {
    mockFetch([dossier({ subject: null })]);

    renderPage();

    expect(await screen.findByText('Agence supprimée (#12)')).toBeInTheDocument();
    expect(screen.getAllByTestId(REPLI_SUJET_TESTID).length).toBeGreaterThan(0);
  });

  /**
   * La régression EXACTE que TCK-362 ferme : une réponse SANS clé `subject` — c'est-à-dire
   * l'`include` omis, ou `KycDossierResource` revenu à n'émettre que `subject_id`.
   *
   * L'écran doit alors afficher « Agence #12 » (il ne sait rien d'autre) ET le dire par le
   * marqueur, sans AFFIRMER une suppression qu'il n'a pas constatée. Sans ce cas, le retour au
   * défaut d'origine ne faisait rougir que l'assertion d'`include`, jamais le rendu.
   */
  it('AC2 — sans clé `subject`, l’écran retombe sur l’identifiant et le SIGNALE comme repli', async () => {
    const sansSujet = dossier();
    delete (sansSujet as Record<string, unknown>).subject;
    mockFetch([sansSujet]);

    renderPage();

    expect(await screen.findByText('Agence #12')).toBeInTheDocument();
    expect(screen.getAllByTestId(REPLI_SUJET_TESTID).length).toBeGreaterThan(0);
    // Et surtout : l'écran n'invente pas une suppression.
    expect(screen.queryByText(/supprimée/)).not.toBeInTheDocument();
  });

  /**
   * Le troisième repli — un sujet polymorphe qui n'est PAS une agence.
   *
   * `KycDossier::subject` est un `morphTo` ; seule `Agency` en ouvre un aujourd'hui, et la file
   * force `filter[subject_type]=Agency`. Le cas n'est donc pas atteignable — mais il l'est en une
   * ligne de plus (`OwnerProfile`, `ServiceProviderProfile`…), et le libellé qui l'attendait
   * annonçait « Agence supprimée » pour un sujet qui n'est ni une agence ni supprimé.
   */
  it('nomme un sujet d’un AUTRE type par son type, sans annoncer de suppression', async () => {
    mockFetch([
      dossier({ subject_id: 7, subject: { id: 7, type: 'User', name: null, slug: null } }),
    ]);

    renderPage();

    expect(await screen.findByText('User #7')).toBeInTheDocument();
    expect(screen.queryByText(/supprimée/)).not.toBeInTheDocument();
    expect(screen.getAllByTestId(REPLI_SUJET_TESTID).length).toBeGreaterThan(0);
  });

  it('AC1 — vérifie un dossier sans quitter la file', async () => {
    const utilisateur = userEvent.setup();
    const { appels } = mockFetch([dossier()]);

    renderPage();
    await utilisateur.click(await screen.findByRole('button', { name: 'Instruire' }));

    const panneau = screen.getByTestId('kyc-decision-panel');
    await utilisateur.click(within(panneau).getByRole('button', { name: 'Vérifier' }));

    await waitFor(() => expect(posts(appels)).toHaveLength(1));
    expect(posts(appels)[0].url).toContain('/api/super-admin/kyc/41/verify');
    // La vérification ne transporte AUCUN motif : `KycController::verify` n'en prend pas.
    expect(posts(appels)[0].init?.body).toBeUndefined();
  });

  it('AC1 — rejette un dossier avec motif, sans quitter la file', async () => {
    const utilisateur = userEvent.setup();
    const { appels } = mockFetch([dossier()]);

    renderPage();
    await utilisateur.click(await screen.findByRole('button', { name: 'Instruire' }));

    const panneau = screen.getByTestId('kyc-decision-panel');
    await utilisateur.type(within(panneau).getByRole('textbox'), 'RCCM expiré depuis mars');
    await utilisateur.click(within(panneau).getByRole('button', { name: 'Rejeter' }));

    await waitFor(() => expect(posts(appels)).toHaveLength(1));
    expect(posts(appels)[0].url).toContain('/api/super-admin/kyc/41/reject');
    expect(JSON.parse(String(posts(appels)[0].init?.body))).toEqual({ reason: 'RCCM expiré depuis mars' });
  });

  /**
   * AC3 — et il est écrit pour refuser le mauvais correctif.
   *
   * Le ticket exige que le test SOUMETTE : un bouton désactivé ou un `required` HTML cocherait
   * « rejet sans motif refusé » sans qu'aucune tentative n'ait eu lieu. On clique donc réellement,
   * et on vérifie DEUX choses — que rien ne part sur le réseau, et que l'écran DIT pourquoi.
   * Une implémentation qui se contenterait de ne rien faire passerait la première et pas la
   * seconde, et c'est bien un défaut : un bouton muet renvoie l'opérateur chercher la panne.
   */
  it('AC3 — un rejet sans motif ne part pas, et l’écran dit pourquoi', async () => {
    const utilisateur = userEvent.setup();
    const { appels } = mockFetch([dossier()]);

    renderPage();
    await utilisateur.click(await screen.findByRole('button', { name: 'Instruire' }));

    const panneau = screen.getByTestId('kyc-decision-panel');
    const rejeter = within(panneau).getByRole('button', { name: 'Rejeter' });
    expect(rejeter).toBeEnabled();

    await utilisateur.click(rejeter);

    expect(posts(appels)).toHaveLength(0);
    expect(
      await within(panneau).findByText("Un rejet demande un motif d'au moins 5 caractères."),
    ).toBeInTheDocument();

    // Le plancher `min:5` de `RejectKycDossierRequest` est tenu côté UI : quatre caractères ne
    // passent pas non plus. Sans ce cas, un test « non vide » resterait vert sur un 422.
    await utilisateur.type(within(panneau).getByRole('textbox'), 'flou');
    await utilisateur.click(rejeter);
    expect(posts(appels)).toHaveLength(0);
  });

  it('AC4 — après une décision, la file et le compteur sont redemandés sans rechargement', async () => {
    const utilisateur = userEvent.setup();
    const { appels } = mockFetch([dossier()], 3);

    renderPage();
    await utilisateur.click(await screen.findByRole('button', { name: 'Instruire' }));

    const lecturesAvant = appels.filter((appel) => appel.init?.method !== 'POST').length;
    // Deux lectures au montage : la file et la tuile « À instruire ». Si l'une d'elles disparaît,
    // l'assertion de refetch ci-dessous perdrait son sens sans rougir — d'où ce point d'ancrage.
    expect(lecturesAvant).toBe(2);

    await utilisateur.click(
      within(screen.getByTestId('kyc-decision-panel')).getByRole('button', { name: 'Vérifier' }),
    );

    // L'invalidation porte sur le PRÉFIXE `['super-admin', 'kyc']` : les deux lectures repartent.
    await waitFor(() =>
      expect(appels.filter((appel) => appel.init?.method !== 'POST').length).toBe(lecturesAvant + 2),
    );
    // …et aucun rechargement de page : le routeur n'a pas été touché par la décision.
    expect(mockReplace).not.toHaveBeenCalled();
  });

  /**
   * D2 — **le motif appartient au dossier qui l'a reçu, et à lui seul.**
   *
   * L'auteur du panneau écrit lui-même que le contraire serait « le pire défaut possible sur cet
   * écran » : un rejet motivé par autre chose, journalisé en audit sur la mauvaise agence. Le
   * mécanisme qui l'empêche est une seule expression — `key={selected?.id ?? 'aucun'}` — et RIEN
   * ne la gardait : la retirer laissait 43 tests verts, parce qu'aucun ne sélectionnait deux
   * dossiers de suite (tous les jeux de données n'en portaient qu'un).
   *
   * Le test assert les DEUX moitiés : ce que l'opérateur VOIT (une zone de saisie vide) et ce qui
   * PART sur le réseau (le motif du second, jamais celui du premier). La seconde seule suffirait
   * à rougir, mais la première nomme le défaut à qui lira l'échec.
   */
  it('change de dossier VIDE le motif saisi — il ne part jamais avec la décision d’un autre', async () => {
    const utilisateur = userEvent.setup();
    const { appels } = mockFetch([
      dossier(),
      dossier({
        id: 42,
        subject_id: 77,
        subject: { id: 77, type: 'Agency', name: 'Saly Résidences', slug: 'saly-residences' },
      }),
    ]);

    renderPage();
    await screen.findByText('Dakar Immo Sarl');

    const instruire = (id: number) =>
      within(screen.getByTestId(`kyc-dossier-${id}`)).getByRole('button', { name: 'Instruire' });
    const panneau = () => screen.getByTestId('kyc-decision-panel');

    await utilisateur.click(instruire(41));
    await utilisateur.type(within(panneau()).getByRole('textbox'), 'RCCM illisible sur le dossier 41');

    await utilisateur.click(instruire(42));

    expect(within(panneau()).getByText('Saly Résidences')).toBeInTheDocument();
    expect(within(panneau()).getByRole('textbox')).toHaveValue('');

    await utilisateur.type(within(panneau()).getByRole('textbox'), 'NINEA absent du dossier 42');
    await utilisateur.click(within(panneau()).getByRole('button', { name: 'Rejeter' }));

    await waitFor(() => expect(posts(appels)).toHaveLength(1));
    expect(posts(appels)[0].url).toContain('/api/super-admin/kyc/42/reject');
    expect(JSON.parse(String(posts(appels)[0].init?.body))).toEqual({
      reason: 'NINEA absent du dossier 42',
    });
  });

  /**
   * D4 — `reason.trim()`, des DEUX côtés, et rien ne le gardait.
   *
   * Retirer les deux `.trim()` laissait 9 tests sur 9 verts. Sans le premier, six espaces passent
   * la garde du front et partent sur le réseau : `TrimStrings` (middleware GLOBAL de Laravel)
   * replie la chaîne à vide avant `RejectKycDossierRequest`, et l'opérateur reçoit un 422 de
   * validation là où le front lui avait promis un message clair. Sans le second, l'audit
   * journalise les espaces de saisie.
   */
  it('un motif fait UNIQUEMENT d’espaces ne part pas — la garde trime avant de compter', async () => {
    const utilisateur = userEvent.setup();
    const { appels } = mockFetch([dossier()]);

    renderPage();
    await utilisateur.click(await screen.findByRole('button', { name: 'Instruire' }));

    const panneau = screen.getByTestId('kyc-decision-panel');
    // SIX espaces : plus long que le plancher de 5 caractères, et pourtant vide de motif.
    await utilisateur.type(within(panneau).getByRole('textbox'), '      ');
    await utilisateur.click(within(panneau).getByRole('button', { name: 'Rejeter' }));

    expect(posts(appels)).toHaveLength(0);
    expect(
      await within(panneau).findByText("Un rejet demande un motif d'au moins 5 caractères."),
    ).toBeInTheDocument();
  });

  it('le motif ENVOYÉ est trimé — l’audit ne journalise pas les espaces de saisie', async () => {
    const utilisateur = userEvent.setup();
    const { appels } = mockFetch([dossier()]);

    renderPage();
    await utilisateur.click(await screen.findByRole('button', { name: 'Instruire' }));

    const panneau = screen.getByTestId('kyc-decision-panel');
    await utilisateur.type(within(panneau).getByRole('textbox'), '   RCCM expiré depuis mars   ');
    await utilisateur.click(within(panneau).getByRole('button', { name: 'Rejeter' }));

    await waitFor(() => expect(posts(appels)).toHaveLength(1));
    expect(JSON.parse(String(posts(appels)[0].init?.body))).toEqual({
      reason: 'RCCM expiré depuis mars',
    });
  });

  /**
   * D1 — **le front possède le texte affiché** (principe non négociable n°5).
   *
   * Scénario mesuré de bout en bout par la revue : deux opérateurs sur la file, ou une seule ligne
   * périmée (`staleTime` 15 s, aucun `refetchInterval`). L'API rend alors 422
   * `Only submitted KYC dossiers can be reviewed.` — de l'anglais CODÉ EN DUR — et le panneau
   * l'affichait mot pour mot, parce que `messageErreurApi` préfère délibérément la prose serveur
   * quand il n'y a pas de code. Le repli `t('decisionFailed')` écrit POUR ce cas n'était jamais
   * atteint.
   *
   * L'API émet désormais un `code` (`KycWorkflowService::CODE_NOT_TRANSITIONABLE`, épinglé côté
   * PHP par `KycWorkflowTest::test_a_second_decision_is_refused_with_a_stable_code`) et le front
   * nomme le cas. Les deux moitiés doivent bouger ensemble ; chacune a son test.
   */
  it('D1 — un refus de transition s’affiche en FRANÇAIS, jamais dans la prose anglaise du serveur', async () => {
    const utilisateur = userEvent.setup();
    const { appels } = mockFetch([dossier()], 1, {
      status: 422,
      body: {
        message: 'Only submitted KYC dossiers can be reviewed.',
        code: 'kyc.not_transitionable',
      },
    });

    renderPage();
    await utilisateur.click(await screen.findByRole('button', { name: 'Instruire' }));

    const panneau = screen.getByTestId('kyc-decision-panel');
    const lecturesAvant = appels.filter((appel) => appel.init?.method !== 'POST').length;
    await utilisateur.click(within(panneau).getByRole('button', { name: 'Vérifier' }));

    expect(
      await within(panneau).findByText(/sa décision vient d'être prise ailleurs/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Only submitted KYC dossiers can be reviewed.'),
    ).not.toBeInTheDocument();

    // …et la file est REDEMANDÉE : dire « c'est périmé » sans rafraîchir laisserait l'opérateur
    // recliquer sur la même ligne, avec le même statut faux sous les yeux.
    await waitFor(() =>
      expect(appels.filter((appel) => appel.init?.method !== 'POST').length).toBeGreaterThan(
        lecturesAvant,
      ),
    );
    attendAucuneCleBrute();
  });

  /**
   * D3 — le badge de la barre latérale et la tuile de la page sont LA MÊME requête.
   *
   * TCK-360 a posé `queueCountQueryOptions('kyc-pending')` — clé `['super-admin','kyc',
   * 'pending-count']` — et son docblock l'écrit : « la clé de cache EST le point de rendez-vous :
   * elle se déclare une fois. » La page en avait déclaré une seconde. Mesuré alors : DEUX GET
   * `per_page=1` identiques à chaque montage, et deux entrées de cache aux cadences différentes
   * (badge : `refetchInterval` 60 s ; tuile : aucun) — donc deux nombres possibles pour la même
   * chose, dans deux coins du même écran.
   *
   * L'assertion qui discrimine est le COMPTE de requêtes : avec deux clés, les deux affichages
   * montreraient quand même le même nombre ici (le préfixe d'invalidation les couvre toutes
   * deux), et un test qui ne comparerait que les nombres resterait vert.
   */
  it('D3 — le badge de la barre latérale et la tuile « À instruire » sont UNE seule requête', async () => {
    const utilisateur = userEvent.setup();
    let total = 3;
    const appels: Appel[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        appels.push({ url: String(input), init });
        if (init?.method === 'POST') {
          total = 2; // la décision vide une ligne de la file
          return { ok: true, status: 200, json: async () => ({ data: dossier({ status: 'verified' }) }) };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [dossier()],
            meta: { total, current_page: 1, last_page: 1, per_page: 20 },
          }),
        };
      }),
    );

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      withIntl(
        <QueryClientProvider client={queryClient}>
          <BadgeBarreLaterale />
          <SuperAdminKycPage />
        </QueryClientProvider>,
      ),
    );

    const comptages = () =>
      appels.filter((appel) => appel.init?.method !== 'POST' && appel.url.includes('per_page=1'));

    await screen.findByText('Dakar Immo Sarl');
    await waitFor(() => expect(screen.getByTestId('badge-barre-laterale')).toHaveTextContent('3'));

    // UN seul GET de comptage pour DEUX affichages : c'est la propriété qu'on garde.
    expect(comptages()).toHaveLength(1);
    expect(within(tuile('À instruire')).getByText('3')).toBeInTheDocument();

    await utilisateur.click(await screen.findByRole('button', { name: 'Instruire' }));
    await utilisateur.click(
      within(screen.getByTestId('kyc-decision-panel')).getByRole('button', { name: 'Vérifier' }),
    );

    // Après la décision : UN seul refetch de comptage, et les DEUX affichages bougent ensemble.
    await waitFor(() => expect(comptages()).toHaveLength(2));
    await waitFor(() => expect(screen.getByTestId('badge-barre-laterale')).toHaveTextContent('2'));
    expect(within(tuile('À instruire')).getByText('2')).toBeInTheDocument();
  });

  it('AC5 — le filtre par statut part dans l’URL, et une URL le rejoue au montage', async () => {
    const utilisateur = userEvent.setup();
    mockFetch([dossier()]);

    const vue = renderPage();
    await screen.findByText('Dakar Immo Sarl');

    await utilisateur.click(screen.getByRole('combobox', { name: 'Filtrer par statut' }));
    await utilisateur.click(await screen.findByRole('option', { name: 'Rejeté' }));

    expect(mockReplace).toHaveBeenCalledWith('?filter%5Bstatus%5D=rejected');

    // Le rejeu : on repart d'une URL qui porte le filtre, comme après un F5 ou un lien partagé.
    vue.unmount();
    parametres.set('filter[status]', 'rejected');
    const { appels } = mockFetch([dossier({ status: 'rejected' })]);

    renderPage();

    await waitFor(() => expect(appels.length).toBeGreaterThan(0));
    expect(new URL(appels[0].url, 'http://localhost').searchParams.get('filter[status]')).toBe('rejected');
  });

  it('ne propose aucune décision sur un dossier que l’API refuserait d’instruire', async () => {
    const utilisateur = userEvent.setup();
    mockFetch([dossier({ status: 'verified', reviewed_at: '2026-08-21T09:00:00+00:00' })]);

    renderPage();
    await utilisateur.click(await screen.findByRole('button', { name: 'Instruire' }));

    const panneau = screen.getByTestId('kyc-decision-panel');
    expect(within(panneau).queryByRole('button', { name: 'Vérifier' })).not.toBeInTheDocument();
    expect(within(panneau).queryByRole('button', { name: 'Rejeter' })).not.toBeInTheDocument();
    expect(within(panneau).getByText('Seul un dossier soumis peut être instruit.')).toBeInTheDocument();
  });

  it('rend l’état vide par EmptyState, pas par un paragraphe', async () => {
    mockFetch([], 0);

    renderPage();

    // `EmptyState` rend son titre en `<h2>` : un `<p>Aucun dossier</p>` ne cocherait pas ce rôle.
    expect(await screen.findByRole('heading', { name: 'Rien à instruire' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
