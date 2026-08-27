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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { withIntl } from '@/test/intl';
import { attendAucuneCleBrute } from '@/test/cles-brutes';
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
function mockFetch(dossiers: unknown[] = [], total = dossiers.length) {
  const appels: Appel[] = [];
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    appels.push({ url: String(input), init });
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

    // AC2 — la forme « Agence #12 » ne doit plus apparaître NULLE PART sur l'écran, y compris
    // dans le panneau. C'est une assertion sur tout le DOM, pas sur la cellule : c'est ce qui
    // attrape la ligne qu'on n'a pas pensé à regarder.
    expect(screen.queryByText(/Agence #\d+/)).not.toBeInTheDocument();
    attendAucuneCleBrute();
  });

  it('retombe sur l’identifiant seulement quand le sujet a disparu', async () => {
    mockFetch([dossier({ subject: null })]);

    renderPage();

    expect(await screen.findByText('Agence supprimée (#12)')).toBeInTheDocument();
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
