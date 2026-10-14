import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { withIntl } from '@/test/intl';
import { AccesAdminProvider } from '@/lib/access/acces-admin-contexte';
import type { AccesAdmin } from '@/lib/access/pages-admin';
import type { User } from '@/types/user';
import { AdminSidebar } from '../AdminSidebar';

/**
 * TCK-633 (lot B, AC1) — la barre `/admin` ne liste QUE les pages que le profil actif peut ouvrir.
 * Elle les reçoit du layout (`AccesAdminProvider`) ; ce fichier les lui fournit directement.
 */
const { fetchModerationQueue } = vi.hoisted(() => ({
  fetchModerationQueue: vi.fn(async () => ({ meta: { pending_count: 3 } })),
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/admin/agency' }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ token: 'jeton' }) }));
vi.mock('@/lib/queries/reviews-moderation', () => ({
  fetchModerationQueue: () => fetchModerationQueue(),
}));
vi.mock('@/lib/queries/property-moderation', () => ({
  fetchPropertyModerationQueue: async () => ({ meta: { pending_count: 0 } }),
}));

const ADMIN = {
  id: 1,
  first_name: 'Awa',
  last_name: 'Diop',
  full_name: 'Awa Diop',
  email: 'awa@example.test',
  roles: ['agency_admin'],
  agency_id: 7,
  avatar_url: null,
} as unknown as User;

const SOLO: AccesAdmin = {
  chemins: [
    '/admin/agency',
    '/admin/agency/kyc',
    '/admin/agency/billing',
    '/admin/finances',
    '/admin/finances/reconciliation',
    '/admin/settings/integrations',
  ],
  espaceIndividuel: true,
};
const STANDARD: AccesAdmin = {
  chemins: [
    '/admin',
    '/admin/team',
    '/admin/roles',
    '/admin/agency',
    '/admin/agency/kyc',
    '/admin/agency/billing',
    '/admin/finances',
    '/admin/finances/reconciliation',
    '/admin/moderation',
    '/admin/moderation/properties',
    '/admin/audit',
    '/admin/settings/integrations',
  ],
  espaceIndividuel: false,
};

function monte(acces: AccesAdmin, hasPendingUpgrade?: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    withIntl(
      <QueryClientProvider client={client}>
        <AccesAdminProvider acces={acces}>
          <AdminSidebar
            user={ADMIN}
            agencyIsStandard={!acces.espaceIndividuel}
            hasPendingUpgrade={hasPendingUpgrade}
          />
        </AccesAdminProvider>
      </QueryClientProvider>,
    ),
  );
}

const LIEN_PASSAGE = '/app/settings/agency/upgrade';
const cartesDePassage = () => document.querySelectorAll(`a[href="${LIEN_PASSAGE}"]`);

const liensDuMenu = () =>
  Array.from(document.querySelectorAll('nav a')).map((a) => a.getAttribute('href'));

describe('<AdminSidebar> — ne liste que les pages accessibles (TCK-633, AC1)', () => {
  beforeEach(() => fetchModerationQueue.mockClear());

  it('solo : « Mon espace », et seulement ses pages', () => {
    monte(SOLO);
    expect(screen.getByRole('navigation', { name: 'Mon espace' })).toBeInTheDocument();
    expect(liensDuMenu()).toEqual([
      '/admin/agency',
      '/admin/agency/kyc',
      '/admin/agency/billing',
      '/admin/finances',
      '/admin/settings/integrations',
    ]);
    expect(screen.queryByTitle('Réservé aux comptes pro')).toBeNull();
  });

  it("solo : la file d'avis n'est pas sondée — la page ne lui est pas ouverte", async () => {
    monte(SOLO);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchModerationQueue).not.toHaveBeenCalled();
  });

  it("admin standard : « Administration », les onze entrées d'avant, dans le même ordre", async () => {
    monte(STANDARD);
    expect(screen.getByRole('navigation', { name: 'Administration' })).toBeInTheDocument();
    expect(liensDuMenu()).toEqual([
      '/admin',
      '/admin/team',
      '/admin/roles',
      '/admin/agency',
      '/admin/agency/kyc',
      '/admin/agency/billing',
      '/admin/finances',
      '/admin/moderation',
      '/admin/moderation/properties',
      '/admin/audit',
      '/admin/settings/integrations',
    ]);
    await waitFor(() => expect(fetchModerationQueue).toHaveBeenCalled());
  });
});

/**
 * TCK-633 — décision 1 du porteur : les cadenas de TCK-371 disparaissent, et l'incitation passe par
 * UNE carte « Passer en agence » dans « Mon espace » (la carte existante `ProUpgradeCard`).
 */
describe('<AdminSidebar> — la carte « Passer en agence » remplace les cadenas (TCK-633)', () => {
  it('solo : une carte, hors du menu, vers la demande de passage', () => {
    monte(SOLO);
    expect(cartesDePassage()).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Passer en agence' })).toHaveAttribute('href', LIEN_PASSAGE);
    // Hors du `<nav>` : ce n'est pas une page de l'espace, c'est une proposition.
    expect(document.querySelector(`nav a[href="${LIEN_PASSAGE}"]`)).toBeNull();
  });

  it('solo dont la demande est en cours : la carte le dit', () => {
    monte(SOLO, true);
    expect(screen.getByRole('link', { name: 'Demande en cours' })).toHaveAttribute('href', LIEN_PASSAGE);
  });

  it("admin standard : aucune carte — il n'a rien à débloquer", () => {
    monte(STANDARD);
    expect(cartesDePassage()).toHaveLength(0);
  });
});
