import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteFailedJob,
  fetchFailedJob,
  fetchFailedJobs,
  retryAllFailedJobs,
  retryFailedJob,
} from '@/lib/queries/super-admin';
import { ApiError } from '@/lib/api';
import type { FailedJob, FailedJobsResponse } from '@/types/super-admin';
import { withIntl } from '@/test/intl';
import { FailedJobsConsole } from '../failed-jobs';

vi.mock('@/lib/queries/super-admin', () => ({
  deleteFailedJob: vi.fn(),
  fetchFailedJob: vi.fn(),
  fetchFailedJobs: vi.fn(),
  retryAllFailedJobs: vi.fn(),
  retryFailedJob: vi.fn(),
}));

/**
 * La troncature que l'API applique à la LISTE : `FailedJobService::present($job, true)` coupe
 * `payload` et `exception` à 1024 caractères (1021 + `...`). Les tests d'AC2 s'appuient dessus —
 * un payload court ferait passer le comportement d'avant TCK-365 exactement comme le nouveau.
 */
const LIST_TRUNCATION = 1024;
const FULL_PAYLOAD = `{"displayName":"App\\\\Jobs\\\\SendDigest","data":"${'x'.repeat(4000)}","tail":"FIN-DU-PAYLOAD"}`;

function job(overrides: Partial<FailedJob> = {}): FailedJob {
  return {
    id: 1,
    uuid: 'e7f1c0a4-0000-4000-8000-000000000001',
    connection: 'redis',
    queue: 'default',
    payload: `${FULL_PAYLOAD.slice(0, LIST_TRUNCATION - 3)}...`,
    exception: 'RuntimeException: boom',
    failed_at: '2026-08-26T10:00:00.000Z',
    ...overrides,
  };
}

function page(jobs: FailedJob[], meta: Partial<FailedJobsResponse['meta']> = {}): FailedJobsResponse {
  return {
    data: jobs,
    meta: { total: jobs.length, current_page: 1, last_page: 1, per_page: 20, ...meta },
  };
}

function renderConsole() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <FailedJobsConsole />
    </QueryClientProvider>,
  ));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<FailedJobsConsole> (TCK-365)', () => {
  it('charge le détail À LA DEMANDE et rend le payload ENTIER, au-delà de la troncature de la liste', async () => {
    vi.mocked(fetchFailedJobs).mockResolvedValue(page([job()]));
    vi.mocked(fetchFailedJob).mockResolvedValue({
      data: job({ payload: FULL_PAYLOAD }),
      warning: 'Payload complet potentiellement sensible.',
    });
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    // La liste ne l'a pas préchargé : c'est la contrainte « pas un payload complet par ligne ».
    expect(fetchFailedJob).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Détail/i }));
    await waitFor(() => expect(fetchFailedJob).toHaveBeenCalledWith(1));

    const rendu = await screen.findByTestId('failed-job-payload');
    // Le cœur de l'AC2 : le payload rendu dépasse la troncature de la liste, et sa FIN est là.
    expect(FULL_PAYLOAD.length).toBeGreaterThan(LIST_TRUNCATION);
    expect(rendu.textContent).toBe(FULL_PAYLOAD);
    expect(rendu.textContent).toContain('FIN-DU-PAYLOAD');
  });

  it("n'émet AUCUNE requête si l'on annule la confirmation de `retry-all`, et annonce le compte", async () => {
    vi.mocked(fetchFailedJobs).mockResolvedValue(
      page([job(), job({ id: 2 })], { total: 37, last_page: 2 }),
    );
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    await user.click(screen.getByRole('button', { name: /Rejouer tout/i }));

    // Le compte annoncé est celui de la FILE ENTIÈRE (`meta.total`), pas celui de la page.
    expect(await screen.findByText(/37 job\(s\) échoué\(s\)/)).toBeInTheDocument();
    expect(retryAllFailedJobs).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /^Annuler$/ }));
    expect(retryAllFailedJobs).not.toHaveBeenCalled();
  });

  it('exige la phrase de confirmation avant de rejouer tout', async () => {
    vi.mocked(fetchFailedJobs).mockResolvedValue(page([job()], { total: 1 }));
    vi.mocked(retryAllFailedJobs).mockResolvedValue({ data: { queued: 1 } });
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    await user.click(screen.getByRole('button', { name: /Rejouer tout/i }));

    const submit = await screen.findByTestId('confirm-action-submit');
    expect(submit).toBeDisabled();
    expect(retryAllFailedJobs).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('confirm-action-input'), 'REJOUER');
    await user.click(submit);
    await waitFor(() => expect(retryAllFailedJobs).toHaveBeenCalledTimes(1));
  });

  it("n'émet AUCUNE requête si l'on annule la confirmation de suppression", async () => {
    vi.mocked(fetchFailedJobs).mockResolvedValue(page([job()], { total: 1 }));
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    await user.click(screen.getByRole('button', { name: /Supprimer/i }));

    expect(await screen.findByText(/1 job échoué \(#1\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Annuler$/ }));
    expect(deleteFailedJob).not.toHaveBeenCalled();
  });

  it('supprime après confirmation, et jamais avant', async () => {
    vi.mocked(fetchFailedJobs).mockResolvedValue(page([job()], { total: 1 }));
    vi.mocked(deleteFailedJob).mockResolvedValue({ data: { deleted: true } });
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    await user.click(screen.getByRole('button', { name: /Supprimer/i }));
    expect(deleteFailedJob).not.toHaveBeenCalled();

    await user.type(screen.getByTestId('confirm-action-input'), 'SUPPRIMER');
    await user.click(screen.getByTestId('confirm-action-submit'));
    // ⚠ react-query v5 passe un SECOND argument (le contexte de mutation) au `mutationFn` :
    // `toHaveBeenCalledWith(1)` échoue alors sur un appel pourtant juste. On assert l'argument.
    await waitFor(() => expect(vi.mocked(deleteFailedJob).mock.calls[0]?.[0]).toBe(1));
  });

  it('atteint les jobs au-delà des 20 premiers via la pagination', async () => {
    vi.mocked(fetchFailedJobs).mockImplementation(async ({ page: p = 1 } = {}) =>
      p === 1
        ? page([job({ id: 1 })], { total: 21, current_page: 1, last_page: 2 })
        : page([job({ id: 21 })], { total: 21, current_page: 2, last_page: 2 }),
    );
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    expect(fetchFailedJobs).toHaveBeenCalledWith({ page: 1, perPage: 20 });

    await user.click(screen.getByRole('button', { name: /Suivant/i }));

    // Le 21e job — hors de portée avant TCK-365, la table étant figée à 20 lignes sans pagination.
    await screen.findByTestId('failed-job-21');
    expect(fetchFailedJobs).toHaveBeenCalledWith({ page: 2, perPage: 20 });
  });

  /**
   * D6 — un échec de MUTATION ne doit pas être muet.
   *
   * `DataState` ne couvre que la requête de LISTE. Avant correctif, `retryAllFailedJobs` rejetée
   * laissait `confirm-action-submit` dans le DOM et l'écran sans un mot : l'opérateur retapait la
   * phrase et recliquait, indéfiniment. Et le cas est celui que le dialogue NOMME lui-même —
   * « au-delà de 500, l'API refuse le lot » —, mesuré jusqu'au navigateur (409 amont, 409 rendu).
   */
  it('annonce l’échec d’un rejeu en lot et referme le dialogue au lieu de le laisser ouvert', async () => {
    vi.mocked(fetchFailedJobs).mockResolvedValue(page([job()], { total: 501 }));
    vi.mocked(retryAllFailedJobs).mockRejectedValue(
      new ApiError(409, { message: 'Too many failed jobs to retry at once.' }),
    );
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    await user.click(screen.getByRole('button', { name: /Rejouer tout/i }));
    await user.type(screen.getByTestId('confirm-action-input'), 'REJOUER');
    await user.click(screen.getByTestId('confirm-action-submit'));

    await waitFor(() => expect(retryAllFailedJobs).toHaveBeenCalledTimes(1));

    // 1. L'échec est DIT — et le message vient du serveur, pas d'un repli générique.
    const bandeau = await screen.findByTestId('failed-jobs-action-error');
    expect(bandeau).toHaveTextContent(/Too many failed jobs/i);
    // 2. Le dialogue ne reste pas ouvert : sinon le geste suivant est un reclic, pas une décision.
    expect(screen.queryByTestId('confirm-action-submit')).not.toBeInTheDocument();
  });

  it('annonce l’échec d’une suppression', async () => {
    vi.mocked(fetchFailedJobs).mockResolvedValue(page([job()], { total: 1 }));
    vi.mocked(deleteFailedJob).mockRejectedValue(new ApiError(404, {}));
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    await user.click(screen.getByRole('button', { name: /Supprimer/i }));
    await user.type(screen.getByTestId('confirm-action-input'), 'SUPPRIMER');
    await user.click(screen.getByTestId('confirm-action-submit'));

    await waitFor(() => expect(deleteFailedJob).toHaveBeenCalledTimes(1));
    // Sans `message` côté serveur, c'est le repli MÉTIER de l'appelant qui parle — pas la clé i18n.
    const bandeau = await screen.findByTestId('failed-jobs-action-error');
    expect(bandeau).toHaveTextContent('La suppression de ce job a échoué.');
    expect(screen.queryByTestId('confirm-action-submit')).not.toBeInTheDocument();
  });

  it('annonce l’échec d’un rejeu unitaire, qui ne passe par aucun dialogue', async () => {
    vi.mocked(fetchFailedJobs).mockResolvedValue(page([job()], { total: 1 }));
    // 404 : le job est parti entre l'affichage et le clic — et c'est un statut SANS code d'erreur
    // catalogué, donc celui qui fait parler le repli MÉTIER plutôt que le libellé générique.
    vi.mocked(retryFailedJob).mockRejectedValue(new ApiError(404, {}));
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    await user.click(screen.getByRole('button', { name: /^Rejouer$/ }));

    await waitFor(() => expect(retryFailedJob).toHaveBeenCalledTimes(1));
    expect(await screen.findByTestId('failed-jobs-action-error'))
      .toHaveTextContent('Le rejeu de ce job a échoué.');
  });

  it('rejoue un job unique sans confirmation — le rejeu ne détruit rien', async () => {
    vi.mocked(fetchFailedJobs).mockResolvedValue(page([job()], { total: 1 }));
    vi.mocked(retryFailedJob).mockResolvedValue({ data: { retried: true } });
    const user = userEvent.setup();
    renderConsole();

    await screen.findByTestId('failed-job-1');
    await user.click(screen.getByRole('button', { name: /^Rejouer$/ }));
    await waitFor(() => expect(vi.mocked(retryFailedJob).mock.calls[0]?.[0]).toBe(1));
  });
});
