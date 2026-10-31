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
  forced: null, daily_budget_usd: '0.5', default_daily_budget_usd: '0.5', spent_today_usd: '0.00000000004',
  chain: [{ provider: 'anthropic', model: 'modele-a', max_tokens: null }],
};
const providers = [{ key: 'anthropic', legal_name: 'Anthropic', key_present: true, selectable: true, reason: null, host: 'api.anthropic.com', models: ['modele-a', 'modele-b'] }];

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}><AiUsagesPanel /></QueryClientProvider>));
}

async function ouvrirLesReglages() {
  await userEvent.click(await screen.findByRole('button', { name: 'Réglages' }));
}

describe('usages IA (TCK-2385)', () => {
  beforeEach(() => {
    vi.mocked(fetchAdminAiUsages).mockReset().mockResolvedValue({ data: [usage], meta: { usd_to_xof: '600' } });
    vi.mocked(fetchAdminAiProviders).mockReset().mockResolvedValue({ data: providers });
    vi.mocked(patchAdminAiUsage).mockReset().mockResolvedValue({ data: [usage], meta: { usd_to_xof: '600' } });
  });

  it('un changement de modèle seul n’épingle pas le plafond par défaut', async () => {
    renderPanel();
    await ouvrirLesReglages();
    expect(await screen.findByLabelText('Plafond journalier (USD)')).toHaveValue('');
    expect(screen.getByText(/Défaut : \$0\.50 \(≈ 300\s*F\s*CFA\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('combobox', { name: 'Modèle forcé' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Anthropic · modele-b' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const payload = vi.mocked(patchAdminAiUsage).mock.calls[0][1];
    expect(payload).toEqual({ forced_provider: 'anthropic', forced_model: 'modele-b' });
    expect('daily_budget_usd' in payload).toBe(false);
  });

  it('abaisser le plafond d’un usage forcé n’envoie pas le forçage : le modèle peut être sorti du catalogue', async () => {
    vi.mocked(fetchAdminAiUsages).mockResolvedValue({ data: [{ ...usage, forced: { provider: 'anthropic', model: 'modele-retire', max_tokens: null } }], meta: { usd_to_xof: '600' } });
    renderPanel();
    await ouvrirLesReglages();

    await userEvent.type(await screen.findByLabelText('Plafond journalier (USD)'), '0.01');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(vi.mocked(patchAdminAiUsage).mock.calls[0][1]).toEqual({ daily_budget_usd: '0.01' });
  });

  it('retirer le forçage l’envoie', async () => {
    vi.mocked(fetchAdminAiUsages).mockResolvedValue({ data: [{ ...usage, forced: { provider: 'anthropic', model: 'modele-a', max_tokens: null } }], meta: { usd_to_xof: '600' } });
    renderPanel();
    await ouvrirLesReglages();

    await userEvent.click(await screen.findByRole('combobox', { name: 'Modèle forcé' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Celui du rôle' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(vi.mocked(patchAdminAiUsage).mock.calls[0][1]).toEqual({ forced_provider: null, forced_model: null });
  });

  it('un plafond saisi est envoyé', async () => {
    renderPanel();
    await ouvrirLesReglages();

    await userEvent.type(await screen.findByLabelText('Plafond journalier (USD)'), '0,00000000004');
    expect(screen.getByText(/^≈ 0,000000024\s*F\s*CFA$/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(vi.mocked(patchAdminAiUsage).mock.calls[0][1]).toMatchObject({ daily_budget_usd: '0.00000000004' });
  });

  it('un plafond propre à l’usage s’affiche, et le vider renvoie null (retour au défaut)', async () => {
    vi.mocked(fetchAdminAiUsages).mockResolvedValue({ data: [{ ...usage, daily_budget_usd: '9' }], meta: { usd_to_xof: '600' } });
    renderPanel();
    await ouvrirLesReglages();
    const champ = await screen.findByLabelText('Plafond journalier (USD)');
    expect(champ).toHaveValue('9');

    await userEvent.clear(champ);
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(vi.mocked(patchAdminAiUsage).mock.calls[0][1]).toMatchObject({ daily_budget_usd: null });
  });

  it('une saisie qui n’est pas un montant ne part pas', async () => {
    renderPanel();
    await ouvrirLesReglages();

    await userEvent.type(await screen.findByLabelText('Plafond journalier (USD)'), '1e-3');

    expect(screen.getByRole('alert')).toHaveTextContent('Saisissez un montant en dollars');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('AC10 — la dépense se lit en dollars, avec son équivalent, sans se lire 0', async () => {
    renderPanel();

    const ligne = await screen.findByRole('row', { name: /essai\.extraction/ });
    expect(ligne).toHaveTextContent(/\$0\.00000000004 \(≈ 0,000000024\s*F\s*CFA\) \/ \$0\.50 \(≈ 300\s*F\s*CFA\)/);
  });

  it('une lecture des fournisseurs en échec s’affiche au lieu de vider le menu en silence', async () => {
    vi.mocked(fetchAdminAiProviders).mockRejectedValue(new Error('Boum'));
    renderPanel();
    await ouvrirLesReglages();

    expect(await screen.findByRole('alert')).toHaveTextContent('Les modèles disponibles n’ont pas pu être chargés');
  });
});
