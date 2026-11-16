import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ToastProvider, Toaster } from '@/components/ui/toast';
import { ApiError } from '@/lib/api';
import type { FicheDuMembreApi } from '@/lib/queries/fiche-du-membre';
import { withIntl } from '@/test/intl';
import type { AdminAgencyUserRow } from '@/types/admin-users';

import { FicheDuMembre } from '../FicheDuMembre';

/**
 * TCK-2928 — la fiche d'un membre (maquette `app-equipe`, a, e1), lue sur la fiche de l'API
 * (`GET …/team/{u}`, TCK-2926) : « Biens suivis » ventilé et sa liste filtrée (`?agent=`), « Clients
 * et visites » et ses clients (`?referent=`), l'ancienneté des commissions dues, la date d'activation
 * de la 2FA ou « Rappeler » (`POST …/two-factor-reminder`, 429 → « déjà rappelé »), l'appareil et la
 * ville de la dernière connexion.
 */
const AGENCE = 12;

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/admin/users/UserRolesEditor', () => ({ UserRolesEditor: () => null }));
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchAbsences: vi.fn(async () => []),
}));
const fetchFicheDuMembre = vi.fn();
const rappelerLaDoubleAuthentification = vi.fn();
vi.mock('@/lib/queries/fiche-du-membre', async (original) => ({
  ...(await original<typeof import('@/lib/queries/fiche-du-membre')>()),
  fetchFicheDuMembre: (...a: unknown[]) => fetchFicheDuMembre(...a),
  rappelerLaDoubleAuthentification: (...a: unknown[]) => rappelerLaDoubleAuthentification(...a),
}));

const MEMBRE: AdminAgencyUserRow = {
  id: 3,
  first_name: 'Moussa',
  last_name: 'Ba',
  email: null,
  phone: null,
  status: 'active',
  last_login_at: null,
  created_at: '2026-01-10T00:00:00Z',
  agent_profiles: [{ agency_id: AGENCE, status: 'active' }],
  properties_followed_count: 2,
  commissions_due_amount: 135000,
  two_factor_enabled: false,
};

const fiche = (e: Partial<FicheDuMembreApi> = {}): FicheDuMembreApi => ({
  user_id: 3,
  portfolio: { properties: { rented: 9, available: 14 }, properties_total: 23, active_customers: 41, visits_this_week: 5 },
  commissions_due: { amount: 135000, leases: 3, oldest_due_at: '2026-10-30' },
  last_login: { at: '2026-11-15T08:00:00Z', device: 'iPhone · Safari', city: 'Dakar' },
  two_factor_enabled: false,
  two_factor_enabled_at: null,
  ...e,
});

function monter(membre: AdminAgencyUserRow = MEMBRE) {
  return render(
    withIntl(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ToastProvider>
          <FicheDuMembre
            membre={membre}
            agencyId={AGENCE}
            currentUserId={1}
            affectations={[]}
            peutAttribuerLeRole={false}
            suspension={null}
            onSuspension={vi.fn()}
            peutDeleguer={false}
            onCouvrir={vi.fn()}
          />
          <Toaster />
        </ToastProvider>
      </QueryClientProvider>,
    ),
  );
}

beforeEach(() => {
  fetchFicheDuMembre.mockReset().mockResolvedValue(fiche());
  rappelerLaDoubleAuthentification.mockReset().mockResolvedValue(undefined);
});

describe('FicheDuMembre — TCK-2928', () => {
  it('AC1 — « 23 biens · 9 en location, 14 à louer ou à vendre », vers la liste des biens filtrée sur la personne', async () => {
    monter();
    await screen.findByText('23 biens · 9 en location, 14 à louer ou à vendre');
    const ligne = screen.getByRole('link', { name: /Biens suivis/ });
    expect(ligne).toHaveTextContent('23 biens · 9 en location, 14 à louer ou à vendre');
    expect(ligne).toHaveAttribute('href', '/app/properties?agent=3');
    expect(fetchFicheDuMembre).toHaveBeenCalledWith('jeton', AGENCE, 3);
  });

  it('AC1 — des biens ni loués ni sur le marché (brouillons…) se comptent à part', async () => {
    fetchFicheDuMembre.mockResolvedValue(fiche({ portfolio: { properties: { rented: 1, available: 2, draft: 3 }, properties_total: 6, active_customers: 0, visits_this_week: 0 } }));
    monter();
    expect(await screen.findByText('6 biens · 1 en location, 2 à louer ou à vendre, 3 autres')).toBeInTheDocument();
  });

  it('AC2 — « 41 clients actifs · 5 visites cette semaine », vers les clients dont la personne est référente', async () => {
    monter();
    const ligne = await screen.findByRole('link', { name: /Clients et visites/ });
    expect(ligne).toHaveTextContent('41 clients actifs · 5 visites cette semaine');
    expect(ligne).toHaveAttribute('href', '/app/customers?referent=3');
  });

  it('AC3 — « 3 baux · la plus ancienne date du 30 oct. » quand des lignes sont dues, rien sans dû', async () => {
    const { unmount } = monter();
    const detail = await screen.findByText(/3 baux · la plus ancienne date du 30 oct\./);
    expect(screen.getByRole('link', { name: /Commissions dues/ })).toContainElement(detail);
    unmount();

    fetchFicheDuMembre.mockResolvedValue(fiche({ commissions_due: { amount: 0, leases: 0, oldest_due_at: null } }));
    monter();
    expect(await screen.findByText('Rien à payer')).toBeInTheDocument();
    expect(screen.queryByText(/la plus ancienne/)).toBeNull();
  });

  it('AC4 — 2FA active : « Activée depuis le 3 févr. », sans « Rappeler »', async () => {
    fetchFicheDuMembre.mockResolvedValue(fiche({ two_factor_enabled: true, two_factor_enabled_at: '2026-02-03T09:00:00Z' }));
    monter();
    expect(await screen.findByText('Activée depuis le 3 févr.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rappeler/ })).toBeNull();
  });

  it('AC4 — inactive : « Pas encore activée » et « Rappeler », qui envoie le rappel et le confirme', async () => {
    const user = userEvent.setup();
    monter();
    expect(await screen.findByText('Pas encore activée')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Rappeler à Moussa Ba d’activer la double authentification' }));
    expect(rappelerLaDoubleAuthentification).toHaveBeenCalledWith('jeton', AGENCE, 3);
    expect(await screen.findByText('Rappel envoyé à Moussa Ba.')).toBeInTheDocument();
  });

  it('AC4 — un 429 dit « déjà rappelé aujourd’hui »', async () => {
    rappelerLaDoubleAuthentification.mockRejectedValue(new ApiError(429, { code: 'team.two_factor_reminder_throttled', message: 'Trop tôt.' }));
    const user = userEvent.setup();
    monter();
    await user.click(await screen.findByRole('button', { name: /Rappeler à Moussa Ba/ }));
    expect(await screen.findByText(/Déjà rappelé aujourd’hui/)).toBeInTheDocument();
  });

  it('AC4 — « Dernière connexion » porte en détail l’appareil et la ville, absents quand l’API ne les rend pas', async () => {
    const { unmount } = monter();
    expect(await screen.findByText('iPhone · Safari · Dakar')).toBeInTheDocument();
    unmount();

    fetchFicheDuMembre.mockResolvedValue(fiche({ last_login: { at: '2026-11-15T08:00:00Z', device: null, city: null } }));
    monter();
    await screen.findByText('Pas encore activée');
    expect(screen.queryByText(/Dakar/)).toBeNull();
  });

  it('fiche illisible : les rangées retombent sur la ligne du tableau, sans « Rappeler » ni clients', async () => {
    fetchFicheDuMembre.mockRejectedValue(new ApiError(403, { message: 'Refus.' }));
    monter();
    expect(await screen.findByRole('link', { name: /Biens suivis/ })).toHaveTextContent('2 biens');
    expect(screen.getByText('Pas encore activée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rappeler/ })).toBeNull();
    expect(screen.queryByText(/Clients et visites/)).toBeNull();
  });
});
