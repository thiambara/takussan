import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AgencySuspendedBanner } from '@/components/agency/AgencySuspendedBanner';
import { withIntl } from '@/test/intl';
import type { User } from '@/types/user';

/**
 * TCK-600 (ADR-0048) — l'équipe d'une agence suspendue voit un bandeau « lecture seule » sur
 * toutes les pages de l'espace, avant tout clic. Le layout est EXÉCUTÉ ; la coque est remplacée
 * par une sonde qui retient ses props.
 */
const getMeAction = vi.fn();
const resolveAgencyOrNull = vi.fn();
const coque = vi.fn();

vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMeAction() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => resolveAgencyOrNull(...args),
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

async function bandeau(roles: string[], statut: string | null): Promise<unknown> {
  getMeAction.mockResolvedValue({ id: 1, roles, agency_id: 7 } as unknown as User);
  resolveAgencyOrNull.mockResolvedValue(statut === null ? null : { id: 7, kind: 'standard', status: statut });
  const element = await AppLayout({ children: null });
  render(element);
  return coque.mock.lastCall?.[0]?.agencySuspended;
}

describe('espace applicatif — bandeau de suspension (TCK-600)', () => {
  beforeEach(() => {
    coque.mockClear();
  });

  it.each([
    [['agency_admin', 'customer'], 'suspended', true],
    [['agent', 'customer'], 'suspended', true],
    [['agency_admin', 'customer'], 'active', false],
    [['agent', 'customer'], 'inactive', false],
    [['agent', 'customer'], null, false],
    [['customer'], 'suspended', false],
  ])('rôles %j, agence %s → bandeau %s', async (roles, statut, attendu) => {
    expect(await bandeau(roles, statut)).toBe(attendu);
  });

  it('le bandeau dit « lecture seule » et ne se masque pas', () => {
    render(withIntl(<AgencySuspendedBanner />));
    expect(screen.getByRole('status')).toHaveTextContent('lecture seule');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
