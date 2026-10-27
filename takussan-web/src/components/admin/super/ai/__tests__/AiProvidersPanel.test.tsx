import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminAiProviders, testAdminAiProvider } from '@/lib/queries/super-admin';
import { withIntl } from '@/test/intl';
import { AiProvidersPanel } from '../AiProvidersPanel';

vi.mock('@/lib/queries/super-admin', () => ({ fetchAdminAiProviders: vi.fn(), testAdminAiProvider: vi.fn() }));

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={queryClient}><AiProvidersPanel /></QueryClientProvider>));
}

describe('fournisseurs IA (TCK-2385)', () => {
  beforeEach(() => {
    vi.mocked(fetchAdminAiProviders).mockReset().mockResolvedValue({ data: [{ key: 'anthropic', legal_name: 'Anthropic', key_present: true, models: ['modele-a'] }] });
    vi.mocked(testAdminAiProvider).mockReset();
  });

  it('un test réussi dit le modèle et la durée', async () => {
    vi.mocked(testAdminAiProvider).mockResolvedValue({ data: { ok: true, model: 'modele-a', duration_ms: 320, error_code: null } });
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Tester la connexion' }));

    expect(await screen.findByText('Connexion établie avec modele-a en 320 ms.')).toBeInTheDocument();
  });

  it('un échec connu se lit en clair, sans code technique', async () => {
    vi.mocked(testAdminAiProvider).mockResolvedValue({ data: { ok: false, model: 'modele-a', duration_ms: null, error_code: 'ai.providers_unavailable' } });
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Tester la connexion' }));

    expect(await screen.findByText(/Aucun fournisseur n’a répondu/)).toBeInTheDocument();
    expect(screen.queryByText(/ai\.providers_unavailable/)).not.toBeInTheDocument();
  });

  it('une exception inconnue : message générique, nom de classe en retrait', async () => {
    vi.mocked(testAdminAiProvider).mockResolvedValue({ data: { ok: false, model: 'modele-a', duration_ms: null, error_code: 'ConnectionException' } });
    renderPanel();

    await userEvent.click(await screen.findByRole('button', { name: 'Tester la connexion' }));

    expect(await screen.findByText('La connexion a échoué.')).toBeInTheDocument();
    expect(screen.getByText('Code : ConnectionException')).toBeInTheDocument();
  });
});
