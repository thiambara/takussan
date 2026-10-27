import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminAiProviders, fetchAdminAiUsages, patchAdminAiUsage } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import type { AiUsageRow } from '@/types/super-admin';
import { AiUsagesPanel } from '../AiUsagesPanel';

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAiUsages: vi.fn(),
  fetchAdminAiProviders: vi.fn(),
  patchAdminAiUsage: vi.fn(),
}));

const usage: AiUsageRow = {
  key: 'essai.extraction', role: 'extraction', prompt_version: 1, max_data_class: 'publique', authority: 'x', enabled: true,
  forced: null, daily_budget_xof: 500, default_daily_budget_xof: 500, spent_today_xof: 12.5,
  chain: [{ provider: 'anthropic', model: 'modele-a', max_tokens: null }],
};
const providers = [{ key: 'anthropic', legal_name: 'Anthropic', key_present: true, models: ['modele-a', 'modele-b'] }];

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}><AiUsagesPanel /></QueryClientProvider>));
}

async function ouvrirLesReglages() {
  await userEvent.click(await screen.findByRole('button', { name: 'Réglages' }));
}

describe('usages IA (TCK-2385)', () => {
  beforeEach(() => {
    vi.mocked(fetchAdminAiUsages).mockReset().mockResolvedValue({ data: [usage] });
    vi.mocked(fetchAdminAiProviders).mockReset().mockResolvedValue({ data: providers });
    vi.mocked(patchAdminAiUsage).mockReset().mockResolvedValue({ data: [usage] });
  });

  it('un changement de modèle seul n’épingle pas le plafond par défaut', async () => {
    renderPanel();
    await ouvrirLesReglages();
    expect(await screen.findByLabelText('Plafond journalier (XOF)')).toHaveValue(null);
    expect(screen.getByText(/Défaut : 500 XOF/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Modèle forcé' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Anthropic · modele-b' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const payload = vi.mocked(patchAdminAiUsage).mock.calls[0][1];
    expect(payload).toEqual({ forced_provider: 'anthropic', forced_model: 'modele-b' });
    expect('daily_budget_xof' in payload).toBe(false);
  });

  it('un plafond saisi est envoyé', async () => {
    renderPanel();
    await ouvrirLesReglages();

    await userEvent.type(await screen.findByLabelText('Plafond journalier (XOF)'), '800');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(vi.mocked(patchAdminAiUsage).mock.calls[0][1]).toMatchObject({ daily_budget_xof: 800 });
  });

  it('un plafond propre à l’usage s’affiche, et le vider renvoie null (retour au défaut)', async () => {
    vi.mocked(fetchAdminAiUsages).mockResolvedValue({ data: [{ ...usage, daily_budget_xof: 900 }] });
    renderPanel();
    await ouvrirLesReglages();
    const champ = await screen.findByLabelText('Plafond journalier (XOF)');
    expect(champ).toHaveValue(900);

    await userEvent.clear(champ);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(vi.mocked(patchAdminAiUsage).mock.calls[0][1]).toMatchObject({ daily_budget_xof: null });
  });

  it('une lecture des fournisseurs en échec s’affiche au lieu de vider le menu en silence', async () => {
    vi.mocked(fetchAdminAiProviders).mockRejectedValue(new Error('Boum'));
    renderPanel();
    await ouvrirLesReglages();

    expect(await screen.findByRole('alert')).toHaveTextContent('Les modèles disponibles n’ont pas pu être chargés');
  });
});
