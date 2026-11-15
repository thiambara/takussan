import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { User } from '@/types/user';

/**
 * TCK-2919 — `/app/maintenance?filter[lease_id]=…` (lien « Interventions » de la fiche du bail,
 * TCK-2912) ouvre la LISTE complète, que `MaintenanceList` borne au bail : ni les files de l'agence
 * ni la vue d'accueil du bailleur, qui ne portent pas ce filtre.
 */
const moi = vi.hoisted(() => ({ user: { id: 5, roles: ['agent'] } as Partial<User> }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => moi.user }));
vi.mock('@/lib/session', () => ({ getActiveProfileId: async () => undefined }));
vi.mock('@/components/console', () => ({ PageHeader: ({ title, description }: { title: string; description?: string }) => <h1 title={description}>{title}</h1> }));
vi.mock('@/components/maintenance/acteurs/MesDemandesDuLocataire', () => ({ MesDemandesDuLocataire: () => <div data-testid="locataire" /> }));
vi.mock('@/components/maintenance/acteurs/InterventionsDuBailleur', () => ({ InterventionsDuBailleur: () => <div data-testid="bailleur" /> }));
vi.mock('@/components/maintenance/acteurs/InterventionsDuPrestataire', () => ({ InterventionsDuPrestataire: () => <div data-testid="prestataire" /> }));
vi.mock('@/components/maintenance/MaintenanceList', () => ({ MaintenanceList: () => <div data-testid="liste" /> }));
vi.mock('@/components/maintenance/files/InterventionsDeLAgence', () => ({ InterventionsDeLAgence: () => <div data-testid="files" /> }));
vi.mock('@/components/payments/ServiceProviderBillsTable', () => ({ ServiceProviderBillsTable: () => <div data-testid="factures" /> }));

async function rendre(searchParams: Record<string, string>) {
  const { default: Page } = await import('../page');
  render(await Page({ searchParams: Promise.resolve(searchParams) }));
}

describe('/app/maintenance?filter[lease_id]= (TCK-2919)', () => {
  it('l’agent ouvre la liste du bail, pas les files', async () => {
    moi.user = { id: 5, roles: ['agent'] };
    await rendre({ 'filter[lease_id]': '31' });
    expect(screen.getByTestId('liste')).toBeInTheDocument();
    expect(screen.queryByTestId('files')).toBeNull();
    expect(screen.getByRole('heading').getAttribute('title')).toBe('Les interventions de ce bail');
  });

  it('le bailleur aussi, pas sa vue d’accueil', async () => {
    moi.user = { id: 23, roles: ['customer', 'owner'] };
    await rendre({ 'filter[lease_id]': '31' });
    expect(screen.getByTestId('liste')).toBeInTheDocument();
    expect(screen.queryByTestId('bailleur')).toBeNull();
  });

  it('sans le paramètre, l’agent garde ses files', async () => {
    moi.user = { id: 5, roles: ['agent'] };
    await rendre({});
    expect(screen.getByTestId('files')).toBeInTheDocument();
  });
});
