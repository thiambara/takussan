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
// TCK-2644 — la liste de l'agence porte elle-même « Nouveau bail » (en-tête compté) : la page lui en
// passe le droit, `peutCreer`, que le bouchon expose.
vi.mock('@/components/leases/LeasesList', () => ({
  LeasesList: ({ vue, peutCreer }: { vue: string; peutCreer: boolean }) => <div data-testid="liste" data-vue={vue} data-peut-creer={String(peutCreer)} />,
}));

import Page from '../page';

/** « Nouveau bail » : le lien de l'en-tête de la page (bailleur, locataire), ou le droit passé à la liste de l'agence. */
const peutCreer = () => screen.queryByRole('link', { name: 'Nouveau bail' }) !== null || screen.getByTestId('liste').dataset.peutCreer === 'true';

beforeEach(() => {
  vi.mocked(capacitesDuProfilActif).mockResolvedValue([]);
});

describe('page des baux — « Nouveau bail » (P152.03)', () => {
  it('un agent sans leases.create ne le voit pas', async () => {
    vi.mocked(getMeAction).mockResolvedValue({ id: 1, agency_id: 3, roles: ['agent', 'customer'] } as never);
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['crm.view_all']);
    render(await Page());
    expect(peutCreer()).toBe(false);
  });

  it('un agent qui tient leases.create le voit', async () => {
    vi.mocked(getMeAction).mockResolvedValue({ id: 1, agency_id: 3, roles: ['agent', 'customer'] } as never);
    vi.mocked(capacitesDuProfilActif).mockResolvedValue(['leases.create']);
    render(await Page());
    expect(screen.getByTestId('liste').dataset.vue).toBe('agence');
    expect(peutCreer()).toBe(true);
  });

  it('un agent aussi bailleur, sans leases.create, le voit pour ses biens', async () => {
    vi.mocked(getMeAction).mockResolvedValue({ id: 1, agency_id: 3, roles: ['owner', 'agent', 'customer'] } as never);
    render(await Page());
    expect(peutCreer()).toBe(true);
  });

  it('un client ne le voit pas', async () => {
    vi.mocked(getMeAction).mockResolvedValue({ id: 1, roles: ['customer'] } as never);
    render(await Page());
    expect(screen.getByTestId('liste').dataset.vue).toBe('locataire');
    expect(peutCreer()).toBe(false);
  });

  it('un bailleur seul le voit dans l’en-tête de la page', async () => {
    vi.mocked(getMeAction).mockResolvedValue({ id: 1, roles: ['owner', 'customer'] } as never);
    render(await Page());
    expect(screen.getByTestId('liste').dataset.vue).toBe('bailleur');
    expect(screen.getByRole('link', { name: 'Nouveau bail' })).toHaveAttribute('href', '/app/leases/new');
  });
});
