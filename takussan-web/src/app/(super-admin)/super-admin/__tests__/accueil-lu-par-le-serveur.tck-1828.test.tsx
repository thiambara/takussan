/**
 * TCK-1828 (P136.05) — l'accueil de `/super-admin` rend ses files, ses métriques et son activité
 * récente au premier affichage : la page serveur les lit, et les amorce dans TanStack.
 *
 * Mesuré le 2026-10-23 : la page rendait les trois sections sans aucune donnée, et six appels au
 * relais `/api/super-admin/*` partaient du navigateur après l'hydratation.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());

const serveur = vi.hoisted(() => ({ lire: vi.fn() }));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: serveur.lire,
}));
vi.mock('@/lib/session', () => ({ getOperatorToken: async () => 'jeton-operateur' }));

const { default: SuperAdminDashboardPage } = await import('../page');

const METRIQUES = {
  agencies: { total: 120, verified: 60, active: 100, suspended: 4, verification_rate: 0.5 },
  users: { total: 400, active: 380 },
  properties: { published: 900, pending_review: 12 },
  leases: { active: 300 },
  revenue: { platform_total_paid: 5_000_000, currency: 'XOF' },
  generated_at: '2026-08-27T10:00:00+00:00',
};

const AUDIT = {
  data: [
    {
      id: 1,
      log_name: 'Admin',
      event: 'super_admin_setting_updated',
      description: 'Paramètre modifié côté serveur',
      causer_type: null,
      causer_id: null,
      subject_type: null,
      subject_id: null,
      properties: null,
      created_at: '2026-08-27T09:00:00+00:00',
    },
  ],
  meta: { total: 1, current_page: 1, last_page: 1, per_page: 5 },
};

const page = (total: number) => ({ data: [], meta: { total, current_page: 1, last_page: 1, per_page: 1 } });

function reponseDe(chemin: string): unknown {
  if (chemin.startsWith('/api/admin/kyc?')) return page(3);
  if (chemin.startsWith('/api/admin/moderation?')) return page(5);
  if (chemin === '/api/admin/agency-upgrade-requests/pending-count') return { count: 2 };
  if (chemin.startsWith('/api/admin/jobs/failed?')) return page(7);
  if (chemin === '/api/admin/system/metrics') return { data: METRIQUES };
  if (chemin.startsWith('/api/admin/audit?')) return AUDIT;
  throw new Error(`chemin inattendu : ${chemin}`);
}

let navigateur: ReturnType<typeof vi.fn>;

async function monter() {
  const ui = await SuperAdminDashboardPage();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(<QueryClientProvider client={client}>{ui}</QueryClientProvider>));
}

const appelsDuNavigateur = () =>
  navigateur.mock.calls.map((c) => String(c[0])).filter((u) => u.startsWith('/api/super-admin/'));

describe('/super-admin — l’accueil lu par la page serveur (TCK-1828)', () => {
  beforeEach(() => {
    serveur.lire.mockReset().mockImplementation(async (chemin: string, opts?: { token?: string }) => {
      expect(opts?.token).toBe('jeton-operateur');
      return reponseDe(chemin);
    });
    navigateur = vi.fn(async (url: string) => {
      const chemin = String(url).replace('/api/super-admin/', '/api/admin/');
      return new Response(JSON.stringify(reponseDe(chemin)), { status: 200 });
    });
    vi.stubGlobal('fetch', navigateur);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('AC1 — files, métriques et activité au premier rendu, sans appel du navigateur', async () => {
    await monter();

    expect(screen.getByTestId('queue-count-kyc-pending')).toHaveTextContent('3');
    expect(screen.getByTestId('queue-count-moderation-pending')).toHaveTextContent('5');
    expect(screen.getByTestId('queue-count-upgrade-requests-pending')).toHaveTextContent('2');
    expect(screen.getByTestId('queue-count-failed-jobs')).toHaveTextContent('7');
    expect(screen.getByTestId('system-metrics-grid').children.length).toBeGreaterThan(0);
    expect(screen.getByText('Paramètre modifié côté serveur')).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 20));
    expect(appelsDuNavigateur()).toEqual([]);
  });

  it('AC2 — une lecture serveur en échec laisse sa seule clé au navigateur', async () => {
    serveur.lire.mockImplementation(async (chemin: string) => {
      if (chemin === '/api/admin/system/metrics') throw new Error('panne');
      return reponseDe(chemin);
    });

    await monter();

    expect(screen.getByTestId('queue-count-kyc-pending')).toHaveTextContent('3');
    await waitFor(() => expect(appelsDuNavigateur()).toEqual(['/api/super-admin/system/metrics']));
    expect(await screen.findByTestId('system-metrics-grid')).toBeInTheDocument();
  });
});
