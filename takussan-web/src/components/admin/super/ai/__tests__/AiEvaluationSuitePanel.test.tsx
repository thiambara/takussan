import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fr from '@/messages/fr.json';
import { withIntl } from '@/test/intl';
import type { AiEvaluationRun } from '@/types/super-admin';
import { AiEvaluationSuitePanel } from '../AiEvaluationSuitePanel';

const fetchSuite = vi.fn();
const postSuite = vi.fn();
let peutGerer = true;

vi.mock('@/lib/queries/super-admin', () => ({
  fetchAdminAiEvaluationSuite: () => fetchSuite(),
  postAdminAiEvaluationSuite: () => postSuite(),
}));
vi.mock('@/components/admin/super/PlatformAbilitiesProvider', () => ({
  usePlatformAbilities: () => ({ can: () => peutGerer }),
}));
vi.mock('@/components/auth/garde-double-facteur-contexte', () => ({ useGardeDoubleFacteur: () => null }));
vi.mock('@/lib/double-facteur', () => ({ avecGardeDoubleFacteur: (fn: () => unknown) => fn() }));

const terminee: AiEvaluationRun = {
  id: 4,
  role: null,
  candidate: null,
  status: 'done',
  below_baseline: false,
  report: {
    usages: {
      'radar.extraction': {
        usage: 'radar.extraction', model: 'anthropic/sonnet', cases: 30, failures: 0, fields: {}, global: 0.91,
        cost_usd: '0.70', baseline: { global: 0.9, fields: {} }, below_baseline: false,
      },
    },
  },
  total_cost_usd: '0.70',
  error_code: null,
  created_at: '2026-11-01T02:30:00+00:00',
  finished_at: '2026-11-01T02:40:00+00:00',
  usd_to_xof: '600',
};

/** Le bouton reste désactivé tant que la dernière évaluation n'est pas lue. */
async function boutonPret() {
  const bouton = await screen.findByTestId('ai-suite-lancer');
  await waitFor(() => expect(bouton).toBeEnabled());
  return bouton;
}

function afficher() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {withIntl(<AiEvaluationSuitePanel />)}
    </QueryClientProvider>,
  );
}

describe('AiEvaluationSuitePanel (TCK-2459)', () => {
  beforeEach(() => {
    fetchSuite.mockReset();
    postSuite.mockReset();
    peutGerer = true;
  });

  it('dit le coût du dernier passage AVANT de lancer, et ne lance rien sans confirmation', async () => {
    fetchSuite.mockResolvedValue({ data: terminee });
    afficher();

    fireEvent.click(await boutonPret());

    expect(await screen.findByText(/dernier passage a coûté/)).toHaveTextContent(/0[.,]70/);
    expect(postSuite).not.toHaveBeenCalled();
  });

  it('lance après confirmation et bloque un second lancement', async () => {
    fetchSuite.mockResolvedValue({ data: null });
    postSuite.mockResolvedValue({ data: { ...terminee, status: 'queued', report: null } });
    afficher();

    fireEvent.click(await boutonPret());
    fireEvent.click(await screen.findByTestId('ai-suite-confirmer'));

    await waitFor(() => expect(postSuite).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('ai-suite-lancer')).toBeDisabled());
  });

  it("n'offre pas le lancement à qui ne peut pas gérer le socle IA", async () => {
    peutGerer = false;
    fetchSuite.mockResolvedValue({ data: null });
    afficher();

    await screen.findByText(fr.superAdmin.pages.ai.suite.never);
    expect(screen.queryByTestId('ai-suite-lancer')).toBeNull();
  });
});
