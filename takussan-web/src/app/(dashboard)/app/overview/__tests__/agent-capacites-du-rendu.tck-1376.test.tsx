/**
 * TCK-1376 (P138.07) — la vue agent lit les capacités par la lecture mémoïsée du rendu, qui porte
 * l'indice de profil (`capacitesDuRendu`), et non plus par `fetchMyCapabilities`, sans indice.
 *
 * Avant : en `agency_admin`, un document `/app/overview/agent` portait deux
 * `GET /api/me/capabilities`, l'un avec l'indice (layout, `accesAdmin`), l'autre sans (page), et
 * la bascule « Agence » d'un compte de plusieurs agences se jugeait hors du profil actif.
 *
 * `cache()` de React ne mémoïse que sous `react-server` : il est remplacé ici par une mémoïsation
 * par rendu, celle que Next applique à une requête.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { User } from '@/types/user';

const caches = vi.hoisted((): Array<() => void> => []);
const apiRequest = vi.fn();
const fetchAgentDashboard = vi.fn();

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>();
      caches.push(() => memo.clear());
      return (...args: A): R => {
        const cle = JSON.stringify(args);
        if (!memo.has(cle)) memo.set(cle, fn(...args));
        return memo.get(cle) as R;
      };
    },
  };
});
vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/components/charts/BarChart', () => ({ BarChart: () => null }));
vi.mock('@/components/charts/LineChart', () => ({ LineChart: () => null }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn() }));
vi.mock('@/lib/session', () => ({
  getToken: async () => 'jeton',
  getActiveProfileId: async () => 'agency_admin:12',
}));
vi.mock('@/lib/access/server-guards', () => ({
  ROUTE_VERIF_INDISPONIBLE: '/verification-indisponible',
  resolveAgencyOrNull: async () => ({ id: 7, kind: 'standard' }),
}));
vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  apiRequest: (...a: unknown[]) => apiRequest(...a),
}));
vi.mock('@/lib/queries/dashboard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/queries/dashboard')>()),
  fetchAgentDashboard: (...a: unknown[]) => fetchAgentDashboard(...a),
}));

import AgentDashboardPage from '../agent/page';
import { accesAdmin } from '@/lib/access/pages-admin-server';
import { ApiError } from '@/lib/api';

const admin = { id: 1, roles: ['agency_admin', 'agent'], agency_id: 7 } as unknown as User;

const page = async (scope?: string) =>
  render(await AgentDashboardPage({ searchParams: Promise.resolve(scope ? { scope } : {}) }));

const appelsCapacites = () => apiRequest.mock.calls.filter(([chemin]) => chemin === '/api/me/capabilities');

beforeEach(() => {
  caches.forEach((vider) => vider());
  apiRequest.mockReset();
  apiRequest.mockResolvedValue({ data: { agency_id: 7, capabilities: ['reports.view_agency'] } });
  fetchAgentDashboard.mockReset();
  fetchAgentDashboard.mockImplementation(async (opts?: { scope?: string }) => ({
    data: {
      agent_id: 1,
      agency_id: 7,
      scope: opts?.scope ?? 'mine',
      period: { start: '2026-07-01', end: '2026-07-31' },
      properties_managed: 3,
      pipeline: {},
      tasks: { open: 0, overdue: 0, items: [] },
      pipeline_ops: { pending_bookings: 0, leases_to_sign: 0, tasks_today: 0 },
      finance: { commissions_month: 0, commissions_year: 0 },
      visits: { upcoming_7d: 0, today_items: [] },
      recent_activity: [],
    },
  }));
});

describe('vue agent — les capacités du rendu', () => {
  it('lit /api/me/capabilities sous le profil actif', async () => {
    await page('agency');

    expect(appelsCapacites()).toHaveLength(1);
    expect(appelsCapacites()[0][1]).toMatchObject({ token: 'jeton', activeProfileId: 'agency_admin:12' });
    expect(fetchAgentDashboard).toHaveBeenCalledWith({ scope: 'agency' });
  });

  it('le layout (accesAdmin) et la page ne font qu’une lecture des capacités', async () => {
    await accesAdmin(admin);
    await page('agency');

    expect(appelsCapacites()).toHaveLength(1);
  });

  it('une panne de lecture : pas de bascule, la vue personnelle', async () => {
    apiRequest.mockRejectedValue(new ApiError(500, null));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await page('agency');

    expect(fetchAgentDashboard).toHaveBeenCalledWith({ scope: 'mine' });
    expect(screen.queryByRole('navigation', { name: 'Portée des chiffres' })).toBeNull();
  });
});
