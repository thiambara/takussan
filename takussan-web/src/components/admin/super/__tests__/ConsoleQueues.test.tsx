import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import {
  fetchAdminAgencyUpgradePendingCount,
  fetchAdminKycQueue,
  fetchFailedJobs,
  fetchModerationQueue,
} from '@/lib/queries/super-admin';
import { ConsoleQueues } from '../ConsoleQueues';
import { withIntl } from '@/test/intl';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAgencyUpgradePendingCount: vi.fn(),
  fetchAdminKycQueue: vi.fn(),
  fetchFailedJobs: vi.fn(),
  fetchModerationQueue: vi.fn(),
}));

/** Une réponse paginée réduite à ce que le compteur lit : `meta.total`. */
const paginated = (total: number) => ({ data: [], meta: { total, current_page: 1, last_page: 1, per_page: 1 } });

function renderQueues(node: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>));
}

describe('ConsoleQueues (TCK-360)', () => {
  beforeEach(() => {
    // Les compteurs d'appels s'accumulent d'un test à l'autre : `mockResolvedValue` ne les remet
    // pas à zéro, et une assertion `toHaveBeenCalledTimes` compterait le test précédent.
    vi.clearAllMocks();
    vi.mocked(fetchAdminKycQueue).mockResolvedValue(paginated(3) as never);
    vi.mocked(fetchModerationQueue).mockResolvedValue(paginated(7) as never);
    vi.mocked(fetchFailedJobs).mockResolvedValue(paginated(1) as never);
    vi.mocked(fetchAdminAgencyUpgradePendingCount).mockResolvedValue(2);
  });

  it('rend les quatre files, chacune vers la vue qui permet de la traiter', async () => {
    renderQueues(<ConsoleQueues />);

    // AC1 — un clic, une destination, et la destination est DÉJÀ filtrée.
    const attendus: Array<[string, string]> = [
      ['queue-row-kyc-pending', '/super-admin/kyc'],
      ['queue-row-upgrade-requests-pending', '/super-admin/agency-upgrade-requests?status=pending'],
      ['queue-row-moderation-pending', '/super-admin/moderation'],
      // TCK-365 — la console des jobs échoués vit désormais sur sa propre page. Cette ligne a
      // porté `/super-admin/system/health` APRÈS le déménagement : verte, elle défendait une
      // cible où la table n'était plus. Un test qui fige une destination doit bouger avec elle.
      ['queue-row-failed-jobs', '/super-admin/system/jobs'],
    ];

    for (const [testId, href] of attendus) {
      expect(await screen.findByTestId(testId)).toHaveAttribute('href', href);
    }

    expect(await screen.findByTestId('queue-count-kyc-pending')).toHaveTextContent('3');
    expect(await screen.findByTestId('queue-count-moderation-pending')).toHaveTextContent('7');
  });

  it('accorde le libellé au singulier quand la file ne porte qu’un élément', async () => {
    renderQueues(<ConsoleQueues />);

    // La pastille et le libellé sont deux éléments : le texte concaténé ne porte pas d'espace.
    expect(await screen.findByTestId('queue-count-failed-jobs')).toHaveTextContent(/^1\s*job à rejouer$/);
  });

  it('affiche une file vide COMME vide, sans la masquer (AC4)', async () => {
    vi.mocked(fetchAdminKycQueue).mockResolvedValue(paginated(0) as never);

    renderQueues(<ConsoleQueues />);

    // La ligne reste là — l'absence de dossier est une information, pas une raison de disparaître.
    expect(await screen.findByTestId('queue-row-kyc-pending')).toBeInTheDocument();
    expect(await screen.findByTestId('queue-count-kyc-pending')).toHaveTextContent('Rien en attente');
  });

  it('distingue le compte indisponible de la file vide', async () => {
    vi.mocked(fetchModerationQueue).mockRejectedValue(new Error('boom'));

    renderQueues(<ConsoleQueues />);

    expect(await screen.findByTestId('queue-count-error-moderation-pending')).toBeInTheDocument();
    // Un compte en erreur ne se rend PAS comme « rien en attente » : les deux diraient `0`.
    expect(screen.queryByTestId('queue-count-moderation-pending')).not.toBeInTheDocument();
  });

  it('compte la file KYC avec les MÊMES paramètres que la page de destination', async () => {
    renderQueues(<ConsoleQueues />);

    await screen.findByTestId('queue-count-kyc-pending');
    // `perPage: 1` lit `meta.total` sans charger la file ; aucun filtre supplémentaire, sans quoi
    // le nombre affiché ne serait pas celui qu'on trouve en cliquant.
    expect(fetchAdminKycQueue).toHaveBeenCalledWith({ perPage: 1 });
    expect(fetchModerationQueue).toHaveBeenCalledWith({ perPage: 1 });
  });
});
