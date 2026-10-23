import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import type { User } from '@/types/user';

/**
 * TCK-1766 (P136.03) — le layout `/app` passe à la coque le marqueur d'accueil de l'agence, pris
 * sur la lecture de l'agence qu'il fait déjà : l'assistant de l'administrateur ne relit plus
 * `GET /api/agencies/{id}`. Le layout est EXÉCUTÉ ; la coque est une sonde qui retient ses props.
 */
const getMeAction = vi.fn();
const resolveAgencyOrNull = vi.fn();
const coque = vi.fn();

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => resolveAgencyOrNull(...args),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({
  accesAdmin: async () => ({ chemins: [], espaceIndividuel: false }),
  capacitesAmorcees: async () => null,
}));
vi.mock('@/lib/queries/agency-upgrade', () => ({ fetchAgencyUpgradeRequests: async () => ({ data: [] }) }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({ IntlProvider: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('@/components/layout/AppShell', () => ({
  AppShell: (props: Record<string, unknown>) => {
    coque(props);
    return null;
  },
}));

const { default: AppLayout } = await import('../layout');

async function marqueur(roles: string[], agence: unknown): Promise<unknown> {
  getMeAction.mockResolvedValue({ id: 1, roles, agency_id: 7 } as unknown as User);
  resolveAgencyOrNull.mockResolvedValue(agence);
  render(await AppLayout({ children: null }));
  return coque.mock.lastCall?.[0]?.agencyStandardWelcome;
}

const DEBLOQUEE = { welcome: { standard_unlocked_at: '2026-10-20T10:00:00Z' } };

describe('layout /app — marqueur d’accueil de l’agence (TCK-1766)', () => {
  beforeEach(() => coque.mockClear());

  it('agence standard débloquée : le marqueur porte l’agence et la date', async () => {
    expect(await marqueur(['agency_admin'], { id: 7, kind: 'standard', status: 'active', metadata: DEBLOQUEE })).toEqual({
      agencyId: 7,
      unlockedAt: '2026-10-20T10:00:00Z',
    });
  });

  it('agence individuelle : aucune date', async () => {
    expect(await marqueur(['agency_admin'], { id: 7, kind: 'individual', status: 'active', metadata: DEBLOQUEE })).toEqual({
      agencyId: 7,
      unlockedAt: null,
    });
  });

  it('agence illisible, ou compte non administrateur : aucun marqueur', async () => {
    expect(await marqueur(['agency_admin'], null)).toBeUndefined();
    expect(await marqueur(['agent'], { id: 7, kind: 'standard', status: 'active', metadata: DEBLOQUEE })).toBeUndefined();
  });
});
