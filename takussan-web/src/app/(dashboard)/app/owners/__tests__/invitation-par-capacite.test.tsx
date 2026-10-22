/**
 * P152.01 — « Ajouter » un bailleur ou un prestataire se montre à qui l'API laisse inviter : l'admin
 * de l'agence, ou le membre qui tient `team.invite` (`OwnerProfilePolicy::invite`,
 * `ServiceProviderProfilePolicy::canInviteIn`). Avant, le seul rôle d'admin comptait.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getMeAction } from '@/app/actions/auth';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: vi.fn() }));
vi.mock('@/lib/session', () => ({ getToken: vi.fn(async () => 'jeton') }));
vi.mock('@/lib/access/pages-admin-server', () => ({ capacitesDuProfilActif: vi.fn(async () => []) }));
vi.mock('@/lib/access/server-guards', () => ({ resolveAgencyOrNull: vi.fn(async () => ({ kind: 'standard' })) }));
vi.mock('@/lib/queries/owners', () => ({ fetchOwners: vi.fn(async () => ({ data: [] })) }));
vi.mock('@/lib/queries/service-providers', () => ({ fetchServiceProviders: vi.fn(async () => ({ data: [] })) }));
vi.mock('@/components/owners/OwnersList', () => ({
  OwnersList: ({ canInvite }: { canInvite: boolean }) => <p>{canInvite ? 'Ajouter' : 'sans invitation'}</p>,
}));
vi.mock('@/components/service-providers/ServiceProvidersList', () => ({
  ServiceProvidersList: ({ canInvite }: { canInvite: boolean }) => <p>{canInvite ? 'Ajouter' : 'sans invitation'}</p>,
}));

import OwnersPage from '../page';
import ProvidersPage from '../../maintenance/providers/page';

const agent = { id: 3, agency_id: 1, roles: ['agent', 'customer'] };
const admin = { id: 2, agency_id: 1, roles: ['agency_admin', 'customer'] };

beforeEach(() => {
  vi.mocked(capacitesDuProfilActif).mockResolvedValue([]);
  vi.mocked(resolveAgencyOrNull).mockResolvedValue({ kind: 'standard' } as never);
});

describe.each([
  ['bailleurs', OwnersPage],
  ['prestataires', ProvidersPage],
])('page des %s — « Ajouter » par capacité', (_nom, Page) => {
  it('un agent qui tient team.invite voit « Ajouter »', async () => {
    vi.mocked(getMeAction).mockResolvedValue(agent as never);
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['team.invite']);
    render((await Page())!);
    expect(screen.getByText('Ajouter')).toBeInTheDocument();
  });

  it('un agent qui ne la tient pas ne le voit pas', async () => {
    vi.mocked(getMeAction).mockResolvedValue(agent as never);
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['crm.view_all']);
    render((await Page())!);
    expect(screen.getByText('sans invitation')).toBeInTheDocument();
  });

  it('une lecture des capacités en panne ne montre rien à l’agent', async () => {
    vi.mocked(getMeAction).mockResolvedValue(agent as never);
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(null);
    render((await Page())!);
    expect(screen.getByText('sans invitation')).toBeInTheDocument();
  });

  it('l’admin de l’agence le voit toujours', async () => {
    vi.mocked(getMeAction).mockResolvedValue(admin as never);
    render((await Page())!);
    expect(screen.getByText('Ajouter')).toBeInTheDocument();
  });
});

it('prestataires : la capacité ne lève pas la condition de type d’agence', async () => {
  vi.mocked(getMeAction).mockResolvedValue(agent as never);
  vi.mocked(capacitesDuProfilActif).mockResolvedValue(['team.invite']);
  vi.mocked(resolveAgencyOrNull).mockResolvedValue(null);
  render((await ProvidersPage())!);
  expect(screen.getByText('sans invitation')).toBeInTheDocument();
});
