import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgentAbsence } from '@/types/agent-crm';

import { FicheDuMembre } from '../FicheDuMembre';

/**
 * TCK-2668 — les absences sur la fiche d'un membre (maquette `app-equipe`, a, « Fiche ») : le bloc de
 * l'absence en cours (« Absent du … au … », qui reprend, qui peut agir ; « Modifier », « Terminer
 * l'absence »), et la carte « Absences » (« Déclarer », en cours, à venir). Une lecture en échec se
 * réessaie (`ErrorState`) ; refusée (403), la carte se tait.
 */
const AGENCE = 12;

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }) }));
vi.mock('@/components/admin/users/UserRolesEditor', () => ({ UserRolesEditor: () => null }));
const fetchAbsences = vi.fn();
const revokeAbsence = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchAbsences: (...a: unknown[]) => fetchAbsences(...a),
  revokeAbsence: (...a: unknown[]) => revokeAbsence(...a),
  fetchMemberPortfolio: vi.fn(),
}));

const PAPE: AdminAgencyUserRow = {
  id: 4,
  first_name: 'Pape',
  last_name: 'Cissé',
  email: null,
  phone: null,
  status: 'active',
  last_login_at: null,
  created_at: '2026-01-01T00:00:00Z',
  agent_profiles: [{ agency_id: AGENCE, status: 'active' }],
};
const EN_COURS: AgentAbsence = {
  id: 30,
  absent: { id: 4, name: 'Pape Cissé' },
  substitute: { id: 5, name: 'Khady Diallo' },
  starts_at: '2026-11-10T00:00:00Z',
  ends_at: '2026-11-14T23:59:59Z',
  status: 'active',
  reason: null,
  substitute_can_act: true,
};
const A_VENIR: AgentAbsence = {
  id: 40,
  absent: { id: 4, name: 'Pape Cissé' },
  substitute: { id: 6, name: 'Mamadou Ndiaye' },
  starts_at: '2026-12-22T00:00:00Z',
  ends_at: '2026-12-26T23:59:59Z',
  status: 'scheduled',
  reason: null,
  substitute_can_act: false,
};

function monter(peutDeleguer = true, garde: GardeDoubleFacteurFn | null = null) {
  const onCouvrir = vi.fn();
  render(
    withIntl(
      <ContexteGardeDoubleFacteur.Provider value={garde}>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <FicheDuMembre
          membre={PAPE}
          agencyId={AGENCE}
          currentUserId={1}
          affectations={[]}
          peutAttribuerLeRole={false}
          peutLireLePortefeuille={false}
          suspension={null}
          onSuspension={vi.fn()}
          peutDeleguer={peutDeleguer}
          onCouvrir={onCouvrir}
        />
      </QueryClientProvider>
      </ContexteGardeDoubleFacteur.Provider>,
    ),
  );
  return { onCouvrir };
}

beforeEach(() => {
  fetchAbsences.mockReset().mockResolvedValue([EN_COURS, A_VENIR]);
  revokeAbsence.mockReset().mockResolvedValue(undefined);
});

describe('FicheDuMembre — les absences', () => {
  it('AC1 — « Absent du 10 au 14 nov. » et « Khady Diallo … peut agir à sa place »', async () => {
    monter();
    const bloc = await waitFor(() => {
      const el = document.querySelector('[data-slot="absence-en-cours"]');
      if (!el) throw new Error('bloc absent');
      return el as HTMLElement;
    });
    expect(bloc).toHaveTextContent('Absent du 10 nov. au 14 nov.');
    expect(bloc).toHaveTextContent('Khady Diallo reçoit ses nouvelles demandes et peut agir à sa place.');
  });

  it('sans délégation liée, le bloc ne dit pas « peut agir »', async () => {
    fetchAbsences.mockResolvedValue([{ ...EN_COURS, substitute_can_act: false }]);
    monter();
    expect(await screen.findByText('Khady Diallo reçoit ses nouvelles demandes.')).toBeInTheDocument();
  });

  it('la carte « Absences » : en cours, couverte par ; à venir, qui reprendra, « Modifier »', async () => {
    const { onCouvrir } = monter();
    const carte = (await screen.findByRole('heading', { name: 'Absences' })).closest('section') as HTMLElement;
    expect(await within(carte).findByText('Du 10 nov. au 14 nov. · couverte par Khady Diallo')).toBeInTheDocument();
    expect(within(carte).getByText('Mamadou Ndiaye reprendra ses nouvelles demandes')).toBeInTheDocument();
    await userEvent.click(within(carte).getByRole('button', { name: 'Modifier' }));
    expect(onCouvrir).toHaveBeenCalledWith({ absentId: 4, absentNom: 'Pape Cissé', absence: A_VENIR });
    await userEvent.click(within(carte).getByRole('button', { name: 'Déclarer' }));
    expect(onCouvrir).toHaveBeenLastCalledWith({ absentId: 4, absentNom: 'Pape Cissé', absence: null });
  });

  it('« Terminer l’absence » révoque l’absence en cours', async () => {
    monter();
    await userEvent.click(await screen.findByRole('button', { name: 'Terminer l’absence' }));
    await waitFor(() => expect(revokeAbsence).toHaveBeenCalledWith('jeton', AGENCE, 30));
  });

  // Vérification de 776dc214f (D4) — une absence À VENIR s'annule depuis sa ligne (l'ancien
  // « Lever » couvrait les absences planifiées comme celle en cours).
  it('une absence à venir s’annule : « Annuler » révoque CETTE absence', async () => {
    monter();
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler l’absence (Du 22 déc. au 26 déc.)' }));
    await waitFor(() => expect(revokeAbsence).toHaveBeenCalledWith('jeton', AGENCE, 40));
    expect(revokeAbsence).not.toHaveBeenCalledWith('jeton', AGENCE, 30);
  });

  // Vérification de 776dc214f (F10) — « Terminer l'absence » passe par la garde du second facteur
  // (`AgentAbsenceController`) : refusée faute d'élévation, elle demande le code puis rejoue.
  it('« Terminer l’absence » refusée faute de second facteur passe par la garde, puis est rejouée', async () => {
    revokeAbsence.mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_step_up_required' }));
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    monter(true, garde);
    await userEvent.click(await screen.findByRole('button', { name: 'Terminer l’absence' }));
    await waitFor(() => expect(revokeAbsence).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledWith('two_factor_step_up_required');
  });

  it('sans le droit de déléguer, l’absence d’un autre se lit sans geste', async () => {
    monter(false);
    await screen.findByText('Du 10 nov. au 14 nov. · couverte par Khady Diallo');
    expect(screen.queryByRole('button', { name: 'Déclarer' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Modifier' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Terminer l’absence' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Annuler l’absence/ })).toBeNull();
  });

  it('la lecture en échec montre l’erreur et « Réessayer », qui relit', async () => {
    fetchAbsences.mockRejectedValueOnce(new ApiError(500, { message: 'Panne.' })).mockResolvedValue([A_VENIR]);
    monter();
    await userEvent.click(await screen.findByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Mamadou Ndiaye reprendra ses nouvelles demandes')).toBeInTheDocument();
    expect(fetchAbsences).toHaveBeenCalledTimes(2);
  });

  it('un 403 (profil hors du personnel) tait la carte', async () => {
    fetchAbsences.mockRejectedValue(new ApiError(403, { message: 'Interdit.' }));
    monter();
    await waitFor(() => expect(fetchAbsences).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Absences' })).toBeNull());
  });
});
