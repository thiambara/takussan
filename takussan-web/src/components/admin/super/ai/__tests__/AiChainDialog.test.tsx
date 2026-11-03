import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api';
import { fetchAdminAiEvaluation, postAdminAiEvaluation, putAdminAiRole } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { AiEvaluationRun, AiProvider } from '@/types/super-admin';
import { AiChainDialog } from '../AiChainDialog';

vi.mock('@/lib/queries/super-admin', () => ({
  putAdminAiRole: vi.fn(),
  postAdminAiEvaluation: vi.fn(),
  fetchAdminAiEvaluation: vi.fn(),
}));

const run: AiEvaluationRun = {
  id: 7, role: 'extraction', candidate: { provider: 'anthropic', model: 'modele-a', max_tokens: 1000 },
  status: 'done', below_baseline: true, total_cost_usd: null, error_code: null, created_at: null, finished_at: null, usd_to_xof: '600',
  report: { usages: { 'essai.extraction': {
    usage: 'essai.extraction', model: 'anthropic/modele-a', cases: 1, failures: 0, global: 0.5, cost_usd: '0.00000000004',
    fields: { prix: 0, titre: 1 }, baseline: { global: 0.9, fields: { prix: 1, titre: 1 } }, below_baseline: true,
  } } },
};

const SANS_CLE = { key: 'openai', legal_name: 'OpenAI', key_present: false, selectable: false, reason: 'key_missing' as const, host: 'api.openai.com', models: ['modele-o'] };

function renderDialog(onOpenChange: (open: boolean) => void = () => {}, providers: AiProvider[] = [{ key: 'anthropic', legal_name: 'Anthropic', key_present: true, selectable: true, reason: null, host: 'api.anthropic.com', models: ['modele-a', 'modele-b'] }]) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={queryClient}>
      <AiChainDialog
        open
        onOpenChange={onOpenChange}
        row={{ role: 'extraction', source: 'config', updated_at: null, chain: [{ provider: 'anthropic', model: 'modele-a', max_tokens: 1000 }] }}
        providers={providers}
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

  it('sans fournisseur sélectionnable à ajouter, le maillon ne s’ajoute pas (TCK-2450)', () => {
    renderDialog(() => {}, [SANS_CLE]);

    expect(screen.getByRole('button', { name: 'Ajouter un maillon' })).toBeDisabled();
  });

  it('ne propose pas un fournisseur non sélectionnable (TCK-2450)', async () => {
    renderDialog(() => {}, [{ key: 'anthropic', legal_name: 'Anthropic', key_present: true, selectable: true, reason: null, host: 'api.anthropic.com', models: ['modele-a'] }, SANS_CLE]);

    await userEvent.click(screen.getAllByRole('combobox')[0]);

    expect(await screen.findByRole('option', { name: 'Anthropic' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'OpenAI' })).not.toBeInTheDocument();
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

  it('une évaluation dont l’appel a échoué dit sa cause (TCK-2399)', async () => {
    const tronquee = { ...run, status: 'failed' as const, below_baseline: null, report: null, error_code: 'ai.response_truncated' };
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: tronquee });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: tronquee });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));

    expect(await screen.findByText('La réponse du modèle a été coupée avant la fin.')).toBeInTheDocument();
    expect(screen.queryByText(/ai\.response_truncated/)).not.toBeInTheDocument();
  });

  it('une évaluation tombée sur un code inconnu reste lisible : message générique, code en retrait', async () => {
    const tombee = { ...run, status: 'failed' as const, below_baseline: null, report: null, error_code: 'ai.code_futur' };
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: tombee });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: tombee });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));

    expect(await screen.findByText('L’évaluation a échoué.')).toBeInTheDocument();
    expect(screen.getByText('Code : ai.code_futur')).toBeInTheDocument();
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

  it('montre le score global (celui du verdict) et le coût de l’évaluation, en plus des champs', async () => {
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: run });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: run });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));

    const global = (await screen.findByRole('row', { name: /^Global/ })).querySelectorAll('td');
    expect(global[0]).toHaveTextContent('0,90');
    expect(global[1]).toHaveTextContent('0,50');
    const cout = screen.getByRole('row', { name: /^Coût de l’évaluation/ }).querySelectorAll('td');
    expect(cout[1]).toHaveTextContent(/^\$0\.00000000004 \(≈ 0,000000024\s*F\s*CFA\)$/);
    expect(screen.getByText(/Candidat évalué : anthropic · modele-a/)).toBeInTheDocument();
  });

  it('sans référence enregistrée, ne dit pas que le candidat « tient la référence »', async () => {
    const sansReference = { ...run, below_baseline: false, report: { usages: { 'essai.extraction': { ...run.report!.usages['essai.extraction'], baseline: null, below_baseline: false } } } };
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: sansReference });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: sansReference });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));

    expect(await screen.findByText('Aucune référence enregistrée.')).toBeInTheDocument();
    expect(screen.queryByText('Le candidat tient la référence.')).not.toBeInTheDocument();
  });

  it('ignore une évaluation dont le candidat n’est plus le premier maillon', async () => {
    const autre = { ...run, candidate: { provider: 'anthropic', model: 'modele-b', max_tokens: null } };
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: autre });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: autre });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));
    await waitFor(() => expect(fetchAdminAiEvaluation).toHaveBeenCalled());

    expect(screen.queryByText('Le candidat est sous la référence.')).not.toBeInTheDocument();
    expect(screen.queryByRole('row', { name: /^Global/ })).not.toBeInTheDocument();
  });

  it('désactive « Évaluer » tant qu’une évaluation est en file ou en cours', async () => {
    const enCours = { ...run, status: 'running' as const, below_baseline: null, report: null };
    vi.mocked(postAdminAiEvaluation).mockResolvedValue({ data: enCours });
    vi.mocked(fetchAdminAiEvaluation).mockResolvedValue({ data: enCours });
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Évaluer le premier maillon' }));

    expect(await screen.findByText('Évaluation en cours…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Évaluer le premier maillon' })).toBeDisabled();
  });

  it('efface l’erreur affichée dès que la chaîne est modifiée', async () => {
    vi.mocked(putAdminAiRole).mockRejectedValue(new ApiError(500, { message: 'Boum' }));
    renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un maillon' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('nomme la position du maillon dans les boutons monter et descendre', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Ajouter un maillon' }));

    expect(screen.getByRole('button', { name: 'Descendre le maillon 1' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Monter le maillon 2' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Monter le maillon 1' })).toBeDisabled();
  });
});
