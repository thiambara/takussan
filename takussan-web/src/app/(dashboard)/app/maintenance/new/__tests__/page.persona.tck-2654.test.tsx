import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import type { User } from '@/types/user';

/**
 * TCK-2654 — `/app/maintenance/new` choisit son formulaire par le persona de la coque : le locataire
 * signale photo d'abord ; tout autre persona garde le formulaire du personnel (titre, description,
 * neuf catégories, quatre priorités). Un agent qui loue aussi un logement reste sur le second : l'API
 * lui exige une description sur les biens de son agence (`isPrincipalFor`).
 */
const moi = vi.hoisted(() => ({ user: { id: 78, roles: ['customer', 'tenant'] } as Partial<User> }));
const profil = vi.hoisted(() => ({ id: undefined as string | undefined }));

vi.mock('next-intl/server', async () => (await import('@/test/intl')).mockTraductionsServeur());
vi.mock('@/app/actions/auth', () => ({ getMeAction: async () => moi.user }));
vi.mock('@/lib/session', () => ({ getActiveProfileId: async () => profil.id }));
vi.mock('@/components/console', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock('@/components/maintenance/acteurs/SignalementDuLocataire', () => ({
  SignalementDuLocataire: ({ initialPropertyId }: { initialPropertyId: number | null }) => (
    <div data-testid="locataire">{String(initialPropertyId)}</div>
  ),
}));
vi.mock('@/components/maintenance/MaintenanceNewLauncher', () => ({
  MaintenanceNewLauncher: () => <div data-testid="personnel" />,
}));

async function rendre(searchParams: Record<string, string> = {}) {
  const { default: Page } = await import('../page');
  render(await Page({ searchParams: Promise.resolve(searchParams) }));
}

describe('/app/maintenance/new — le formulaire suit le persona (TCK-2654)', () => {
  beforeEach(() => {
    profil.id = undefined;
    moi.user = { id: 78, roles: ['customer', 'tenant'] };
  });

  it('le locataire a le signalement photo d’abord, titré « Signaler un problème »', async () => {
    await rendre({ property: '44' });
    expect(screen.getByTestId('locataire')).toHaveTextContent('44');
    expect(screen.getByRole('heading', { name: 'Signaler un problème' })).toBeInTheDocument();
    expect(screen.queryByTestId('personnel')).toBeNull();
  });

  it('un ?property= illisible n’est pas transmis', async () => {
    await rendre({ property: 'abc' });
    expect(screen.getByTestId('locataire')).toHaveTextContent('null');
  });

  it('un agent qui loue aussi garde le formulaire du personnel', async () => {
    moi.user = { id: 3, roles: ['customer', 'tenant', 'agent'] };
    profil.id = 'agent:12';
    await rendre();
    expect(screen.getByTestId('personnel')).toBeInTheDocument();
    expect(screen.queryByTestId('locataire')).toBeNull();
  });

  it('un bailleur, sans profil actif lisible, garde le formulaire du personnel', async () => {
    moi.user = { id: 23, roles: ['customer', 'tenant', 'owner'] };
    await rendre();
    expect(screen.getByTestId('personnel')).toBeInTheDocument();
  });
});
