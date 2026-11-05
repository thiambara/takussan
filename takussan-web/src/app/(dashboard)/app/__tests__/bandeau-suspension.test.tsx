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
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton', getActiveProfileId: async () => undefined }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: (...args: unknown[]) => resolveAgencyOrNull(...args),
}));
// TCK-633 (lot B) — le layout calcule aussi les pages admin accessibles ; sans objet ici.
vi.mock('@/lib/access/pages-admin-server', () => ({
  accesAdmin: async () => ({ chemins: [], espaceIndividuel: false }),
  // TCK-1278 — rien à amorcer : `AmorceCapacites` rend alors ses enfants tels quels.
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
    // Revue de TCK-2478 (I3) — le bailleur d'une agence suspendue : l'API refuse ses écritures (423),
    // la barre retire donc son action « Proposer un bien » (`agencySuspended`).
    [['owner', 'customer'], 'suspended', true],
    [['owner', 'customer'], 'active', false],
  ])('rôles %j, agence %s → bandeau %s', async (roles, statut, attendu) => {
    expect(await bandeau(roles, statut)).toBe(attendu);
  });

  it('un bailleur sans agence (`agency_id` nul) ne paie aucune lecture d’agence', async () => {
    resolveAgencyOrNull.mockClear();
    getMeAction.mockResolvedValue({ id: 1, roles: ['owner', 'customer'], agency_id: null } as unknown as User);
    resolveAgencyOrNull.mockResolvedValue({ id: 7, kind: 'standard', status: 'suspended' });
    render(await AppLayout({ children: null }));
    expect(coque.mock.lastCall?.[0]?.agencySuspended).toBe(false);
    expect(resolveAgencyOrNull).not.toHaveBeenCalled();
  });

  it('le bandeau dit « lecture seule » et ne se masque pas', () => {
    render(withIntl(<AgencySuspendedBanner />));
    expect(screen.getByRole('status')).toHaveTextContent('lecture seule');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
