/**
 * P152.03 — « Nouveau bail » se juge comme `LeaseService::create` : le bailleur, ou le personnel qui
 * tient `leases.create` dans l'agence du profil actif. Avant, tout agent ou admin le voyait.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMeAction } from '@/app/actions/auth';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn() }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: vi.fn(async () => []) }));
vi.mock('@/components/leases/LeasesList', () => ({ LeasesList: () => null }));

import Page from '../page';

const nouveauBail = () => screen.queryByRole('link', { name: 'Nouveau bail' });

beforeEach(() => {
  vi.mocked(capacitesDuProfilActif).mockResolvedValue([]);
});

describe('page des baux — « Nouveau bail » (P152.03)', () => {
  it('un agent sans leases.create ne le voit pas', async () => {
    vi.mocked(getMeAction).mockResolvedValue({ id: 1, agency_id: 3, roles: ['agent', 'customer'] } as never);
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['crm.view_all']);
    render(await Page());
    expect(nouveauBail()).toBeNull();
  });

  it('un agent qui tient leases.create le voit', async () => {
    vi.mocked(getMeAction).mockResolvedValue({ id: 1, agency_id: 3, roles: ['agent', 'customer'] } as never);
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['leases.create']);
    render(await Page());
    expect(nouveauBail()).toHaveAttribute('href', '/app/leases/new');
  });

  it('un agent aussi bailleur, sans leases.create, le voit pour ses biens', async () => {
    vi.mocked(getMeAction).mockResolvedValue({ id: 1, agency_id: 3, roles: ['owner', 'agent', 'customer'] } as never);
    render(await Page());
    expect(nouveauBail()).toBeInTheDocument();
  });

  it('un client ne le voit pas', async () => {
    vi.mocked(getMeAction).mockResolvedValue({ id: 1, roles: ['customer'] } as never);
    render(await Page());
    expect(nouveauBail()).toBeNull();
  });
});
