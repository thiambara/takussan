import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { fetchAdminAiEvaluation, postAdminAiEvaluation, putAdminAiRole } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { AiEvaluationRun } from '@/types/super-admin';
import { AiChainDialog } from '../AiChainDialog';

vi.mock('@/lib/queries/super-admin', () => ({
  putAdminAiRole: vi.fn(),
  postAdminAiEvaluation: vi.fn(),
  fetchAdminAiEvaluation: vi.fn(),
}));

const run: AiEvaluationRun = {
  id: 7, role: 'extraction', candidate: { provider: 'anthropic', model: 'modele-b', max_tokens: null },
  status: 'done', below_baseline: true, error_code: null, created_at: null, finished_at: null,
  report: { usages: { 'essai.extraction': {
    usage: 'essai.extraction', model: 'anthropic/modele-b', cases: 1, failures: 0, global: 0.5, cost_xof: 1,
    fields: { prix: 0, titre: 1 }, baseline: { global: 0.9, fields: { prix: 1, titre: 1 } }, below_baseline: true,
  } } },
};

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <AiChainDialog
        open
        onOpenChange={() => {}}
        row={{ role: 'extraction', source: 'config', updated_at: null, chain: [{ provider: 'anthropic', model: 'modele-a', max_tokens: 1000 }] }}
        providers={[{ key: 'anthropic', legal_name: 'Anthropic', key_present: true, models: ['modele-a', 'modele-b'] }]}
      />
    </QueryClientProvider>,
  ));
}

describe('chaîne d’un rôle (TCK-2385)', () => {
  beforeEach(() => {
    vi.mocked(postAdminAiEvaluation).mockReset();
    vi.mocked(fetchAdminAiEvaluation).mockReset();
    vi.mocked(putAdminAiRole).mockReset();
  });

  it('compare en place et candidat, et exige un motif sous la référence', async () => {
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: run });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: run });
    vi.mocked(putAdminAiRole).mockResolvedValue({ data: { roles: [], providers: [] } });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));

    expect(await screen.findByText('Le candidat est sous la référence.')).toBeInTheDocument();
    const appliquer = screen.getByRole('button', { name: 'Appliquer' });
    expect(appliquer).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Motif de la dérogation'), 'Panne prolongée');
    expect(appliquer).toBeEnabled();
  });

  it('dit pourquoi une évaluation tuée a échoué, sans afficher un nom de classe en titre', async () => {
    const perdue = { ...run, status: 'failed' as const, below_baseline: null, report: null, error_code: 'ai.eval.job_lost' };
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: perdue });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: perdue });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));

    expect(await screen.findByText(/L’évaluation a été perdue/)).toBeInTheDocument();
  });

  it('une évaluation tombée en exception reste lisible : message générique, code en retrait', async () => {
    const tombee = { ...run, status: 'failed' as const, below_baseline: null, report: null, error_code: 'RuntimeException' };
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: tombee });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: tombee });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));

    expect(await screen.findByText('L’évaluation a échoué.')).toBeInTheDocument();
    expect(screen.getByText('Code : RuntimeException')).toBeInTheDocument();
  });

  it('nomme l’échec quand des appels ont échoué, au lieu de dire « sous la référence »', async () => {
    const enPanne = { ...run, report: { usages: { 'essai.extraction': { ...run.report!.usages['essai.extraction'], failures: 1, verdict: 'ai.eval.failures' as const } } } };
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: enPanne });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: enPanne });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));

    expect(await screen.findByText(/Des appels ont échoué pendant l’évaluation/)).toBeInTheDocument();
    expect(screen.queryByText('Le candidat est sous la référence.')).not.toBeInTheDocument();
    expect(screen.getByText(/1 appel a échoué sur 1 cas/)).toBeInTheDocument();
  });

  it('un 422 « sous la référence » ouvre le champ de motif, et le rejeu le porte', async () => {
    vi.mocked(putAdminAiRole)
      .mockRejectedValueOnce(new ApiError(422, { code: 'ai.evaluation_below_baseline', message: 'Ce modèle a été évalué sous la référence : indiquez un motif pour l’affecter quand même.' }))
      .mockResolvedValueOnce({ data: { roles: [], providers: [] } });
    renderDialog();

    expect(screen.queryByLabelText('Motif de la dérogation')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('indiquez un motif');
    const motif = await screen.findByLabelText('Motif de la dérogation');
    expect(screen.getByRole('button', { name: 'Appliquer' })).toBeDisabled();

    await userEvent.type(motif, 'Panne prolongée');
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));

    expect(putAdminAiRole).toHaveBeenLastCalledWith('extraction', [{ provider: 'anthropic', model: 'modele-a', max_tokens: 1000 }], 'Panne prolongée');
  });
});
