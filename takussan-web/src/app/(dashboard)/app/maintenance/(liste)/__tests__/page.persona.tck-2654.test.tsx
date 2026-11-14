import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { User } from '@/types/user';

/**
 * TCK-2654 — `/app/maintenance` ouvre « mes demandes » au persona locataire de la coque ; `?status=`
 * (« Tout voir ») garde la liste complète. Le bailleur ouvre ses interventions (lot 3), le prestataire
 * « Mes interventions » (lot 4) ; l'agent et l'admin gardent les files (TCK-2653).
 */
const moi = vi.hoisted(() => ({ user: { id: 78, roles: ['customer', 'tenant'] } as Partial<User> }));
const profil = vi.hoisted(() => ({ id: undefined as string | undefined }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => moi.user }));
vi.mock('@/lib/session', () => ({ getActiveProfileId: async () => profil.id }));
vi.mock('@/components/console', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock('@/components/maintenance/acteurs/MesDemandesDuLocataire', () => ({ MesDemandesDuLocataire: () => <div data-testid="locataire" /> }));
vi.mock('@/components/maintenance/acteurs/InterventionsDuBailleur', () => ({ InterventionsDuBailleur: () => <div data-testid="bailleur" /> }));
vi.mock('@/components/maintenance/acteurs/InterventionsDuPrestataire', () => ({ InterventionsDuPrestataire: () => <div data-testid="prestataire" /> }));
vi.mock('@/components/maintenance/MaintenanceList', () => ({ MaintenanceList: () => <div data-testid="liste" /> }));
vi.mock('@/components/maintenance/files/InterventionsDeLAgence', () => ({ InterventionsDeLAgence: () => <div data-testid="files" /> }));
vi.mock('@/components/payments/ServiceProviderBillsTable', () => ({
  ServiceProviderBillsTable: ({ mode }: { mode: string }) => <div data-testid="factures" data-mode={mode} />,
}));

async function rendre(searchParams: Record<string, string> = {}) {
  const { default: Page } = await import('../page');
  render(await Page({ searchParams: Promise.resolve(searchParams) }));
}

describe('/app/maintenance — la vue suit le persona (TCK-2654)', () => {
  beforeEach(() => {
    profil.id = undefined;
    moi.user = { id: 78, roles: ['customer', 'tenant'] };
  });

  it('le locataire ouvre « mes demandes »', async () => {
    await rendre();
    expect(screen.getByTestId('locataire')).toBeInTheDocument();
    expect(screen.queryByTestId('liste')).toBeNull();
  });

  it('« Tout voir » (?status=) garde la liste complète', async () => {
    await rendre({ status: 'closed,cancelled' });
    expect(screen.getByTestId('liste')).toBeInTheDocument();
    expect(screen.queryByTestId('locataire')).toBeNull();
  });

  it('le bailleur ouvre ses interventions (lot 3)', async () => {
    moi.user = { id: 23, roles: ['customer', 'owner'] };
    await rendre();
    expect(screen.getByTestId('bailleur')).toBeInTheDocument();
    expect(screen.queryByTestId('liste')).toBeNull();
    expect(screen.queryByTestId('locataire')).toBeNull();
  });

  it('« Tout voir » du bailleur (?status=) garde la liste complète', async () => {
    moi.user = { id: 23, roles: ['customer', 'owner'] };
    await rendre({ status: 'open,acknowledged' });
    expect(screen.getByTestId('liste')).toBeInTheDocument();
    expect(screen.queryByTestId('bailleur')).toBeNull();
  });

  it('le prestataire ouvre « Mes interventions » (lot 4), sans le registre des factures en dessous', async () => {
    moi.user = { id: 18, roles: ['customer', 'service_provider'] };
    await rendre();
    expect(screen.getByTestId('prestataire')).toBeInTheDocument();
    expect(screen.queryByTestId('liste')).toBeNull();
    expect(screen.queryByTestId('factures')).toBeNull();
  });

  it('« Toutes » du prestataire (?factures=toutes) ouvre le registre de ses factures', async () => {
    moi.user = { id: 18, roles: ['customer', 'service_provider'] };
    await rendre({ factures: 'toutes' });
    expect(screen.getByTestId('factures')).toHaveAttribute('data-mode', 'provider');
    expect(screen.getByRole('heading', { name: 'Toutes mes factures' })).toBeInTheDocument();
    expect(screen.queryByTestId('prestataire')).toBeNull();
  });

  it('« Tout voir » du prestataire (?status=) garde la liste complète et ses factures', async () => {
    moi.user = { id: 18, roles: ['customer', 'service_provider'] };
    await rendre({ status: 'closed' });
    expect(screen.getByTestId('liste')).toBeInTheDocument();
    expect(screen.getByTestId('factures')).toBeInTheDocument();
    expect(screen.queryByTestId('prestataire')).toBeNull();
  });

  it('l’agent garde les files', async () => {
    moi.user = { id: 3, roles: ['customer', 'tenant', 'agent'] };
    profil.id = 'agent:12';
    await rendre();
    expect(screen.getByTestId('files')).toBeInTheDocument();
  });
});
