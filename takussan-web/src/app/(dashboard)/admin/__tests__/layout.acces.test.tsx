import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';

/**
 * TCK-633 (lot B) — le layout `/admin` calcule les pages accessibles UNE fois et les fournit à la
 * coque. Le layout est EXÉCUTÉ ; la coque est remplacée par une sonde qui lit le contexte.
 *
 * Décision 1 du porteur : la carte « Passer en agence » vit dans « Mon espace » — le layout lit
 * donc, pour une agence `individual` seulement, si une demande de passage est en cours.
 */
const { getMe, accesAdmin, sonde, redirect, kind, demandes } = vi.hoisted(() => ({
  getMe: vi.fn(),
  accesAdmin: vi.fn(),
  sonde: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`);
  }),
  kind: { valeur: 'individual' as 'individual' | 'standard' },
  demandes: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: (url: string) => redirect(url) }));
vi.mock('@/app/actions/auth', () => ({ getMeAction: () => getMe() }));
vi.mock('@/lib/session', () => ({ getToken: async () => 'jeton' }));
vi.mock('@/lib/access/server-guards', () => ({
  resolveAgencyOrNull: async () => ({ id: 7, kind: kind.valeur }),
}));
vi.mock('@/lib/queries/agency-upgrade', () => ({
  fetchAgencyUpgradeRequests: (...a: unknown[]) => demandes(...a),
}));
vi.mock('@/lib/access/pages-admin-server', () => ({ accesAdmin: (u: User) => accesAdmin(u) }));
vi.mock('@/i18n/messages', () => ({ messagesPour: async () => ({}) }));
vi.mock('@/i18n/IntlProvider', () => ({
  IntlProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/layout/AdminShell', async () => {
  const { useAccesAdmin } = await import('@/lib/access/acces-admin-contexte');
  return {
    AdminShell: (props: { agencyIsStandard?: boolean; hasPendingUpgrade?: boolean }) => {
      sonde({
        acces: useAccesAdmin(),
        agencyIsStandard: props.agencyIsStandard,
        hasPendingUpgrade: props.hasPendingUpgrade,
      });
      return null;
    },
  };
});

const { default: AdminLayout } = await import('../layout');

const ADMIN = { id: 1, roles: ['agency_admin'], agency_id: 7 } as unknown as User;

describe('layout /admin — le fournisseur d’accès (TCK-633)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    kind.valeur = 'individual';
    demandes.mockResolvedValue({ data: [] });
  });

  it('fournit à la coque les pages accessibles du profil actif', async () => {
    const acces: AccesAdmin = { chemins: ['/admin/agency'], espaceIndividuel: true };
    getMe.mockResolvedValue(ADMIN);
    accesAdmin.mockResolvedValue(acces);

    render(await AdminLayout({ children: null }));

    expect(accesAdmin).toHaveBeenCalledWith(ADMIN);
    expect(sonde).toHaveBeenLastCalledWith({ acces, agencyIsStandard: false, hasPendingUpgrade: false });
  });

  it('éjecte toujours un non-admin vers son profil, sans rien calculer', async () => {
    getMe.mockResolvedValue({ id: 2, roles: ['customer'], agency_id: null });
    await expect(AdminLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT /app/profile');
    expect(accesAdmin).not.toHaveBeenCalled();
  });

  it('solo dont la demande de passage est en cours : la coque le reçoit', async () => {
    getMe.mockResolvedValue(ADMIN);
    accesAdmin.mockResolvedValue({ chemins: ['/admin/agency'], espaceIndividuel: true });
    demandes.mockResolvedValue({ data: [{ status: 'rejected' }, { status: 'pending' }] });

    render(await AdminLayout({ children: null }));

    expect(demandes).toHaveBeenCalledWith('jeton', 7);
    expect(sonde).toHaveBeenLastCalledWith(expect.objectContaining({ hasPendingUpgrade: true }));
  });

  it("agence standard : les demandes de passage ne sont pas lues — il n'y a pas de carte", async () => {
    kind.valeur = 'standard';
    getMe.mockResolvedValue(ADMIN);
    accesAdmin.mockResolvedValue({ chemins: ['/admin'], espaceIndividuel: false });

    render(await AdminLayout({ children: null }));

    expect(demandes).not.toHaveBeenCalled();
    expect(sonde).toHaveBeenLastCalledWith(
      expect.objectContaining({ agencyIsStandard: true, hasPendingUpgrade: undefined }),
    );
  });

  it('demandes illisibles : pas de « demande en cours » inventée', async () => {
    getMe.mockResolvedValue(ADMIN);
    accesAdmin.mockResolvedValue({ chemins: ['/admin/agency'], espaceIndividuel: true });
    demandes.mockRejectedValue(new Error('panne'));

    render(await AdminLayout({ children: null }));

    expect(sonde).toHaveBeenLastCalledWith(expect.objectContaining({ hasPendingUpgrade: false }));
  });
});
