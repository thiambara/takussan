import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { User } from '@/types/user';

/**
 * TCK-633 (lot B, AC1) — la carte « Administration » du profil ne propose que des pages que le
 * profil peut ouvrir, et parle à un solo de « son espace », avec un rôle qu'il comprend.
 */
const { accesAdmin } = vi.hoisted(() => ({ accesAdmin: vi.fn() }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/lib/access/pages-admin-server', () => ({ accesAdmin: (u: User) => accesAdmin(u) }));

const { ProfileAdminSection } = await import('../ProfileAdminSection');

const ADMIN = { id: 1, roles: ['agency_admin', 'customer'], agency_id: 7 } as unknown as User;
const hrefs = () => screen.getAllByRole('link').map((l) => l.getAttribute('href'));

describe('<ProfileAdminSection> (TCK-633)', () => {
  it('solo : « Mon espace », un rôle compréhensible, et aucun lien vers une page qui le refuse', async () => {
    accesAdmin.mockResolvedValue({
      chemins: ['/admin/agency', '/admin/agency/kyc', '/admin/finances', '/admin/settings/integrations'],
      espaceIndividuel: true,
    });
    render((await ProfileAdminSection({ user: ADMIN }))!);

    expect(screen.getByRole('heading', { name: 'Mon espace' })).toBeInTheDocument();
    expect(screen.getByText("Titulaire de l'espace")).toBeInTheDocument();
    expect(screen.queryByText('Admin agence')).toBeNull();
    expect(hrefs()).toEqual(['/admin/agency']);
    expect(screen.getByRole('link', { name: 'Ouvrir mon espace' })).toHaveAttribute('href', '/admin/agency');
    expect(accesAdmin).toHaveBeenCalledWith(ADMIN);
  });

  it("admin standard : la carte d'avant, à l'identique", async () => {
    accesAdmin.mockResolvedValue({
      chemins: ['/admin', '/admin/team', '/admin/agency', '/admin/audit'],
      espaceIndividuel: false,
    });
    render((await ProfileAdminSection({ user: ADMIN }))!);

    expect(screen.getByRole('heading', { name: 'Administration' })).toBeInTheDocument();
    expect(screen.getByText('Admin agence')).toBeInTheDocument();
    expect(hrefs()).toEqual(['/admin/agency', '/admin/audit', '/admin']);
  });

  it('aucune page accessible : la carte ne se rend pas', async () => {
    accesAdmin.mockResolvedValue({ chemins: [], espaceIndividuel: false });
    expect(await ProfileAdminSection({ user: ADMIN })).toBeNull();
  });
});
