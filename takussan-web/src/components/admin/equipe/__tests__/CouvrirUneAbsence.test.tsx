import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ContexteGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { ApiError } from '@/lib/api';
import type { GardeDoubleFacteurFn } from '@/lib/double-facteur';
import { withIntl } from '@/test/intl';
import type { AdminAgencyUserRow } from '@/types/admin-users';
import type { AgentAbsence } from '@/types/agent-crm';

import { CouvrirUneAbsence, type CibleDAbsence } from '../CouvrirUneAbsence';

/**
 * TCK-2668 — « Couvrir une absence » : l'absence et la délégation liée en un geste (ADR-0035,
 * amendement). AC1 : la case cochée envoie `substitute_can_act: true` ; AC2 : sans le droit de
 * déléguer, ni case ni champ. Une modification n'envoie que ce qui change
 * (`UpdateAgentAbsenceRequest::touchesGrant`), et chaque écriture passe par la double authentification.
 */
const AGENCE = 12;

vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }) }));
vi.mock('@/hooks/useMatchesMedia', () => ({ useMatchesMedia: () => true }));
// Le calendrier en surcouche ne se pilote pas dans jsdom : un champ de saisie tient sa place.
vi.mock('@/components/ui/date-picker', () => ({
  DatePicker: (p: { id?: string; value?: string; onValueChange: (v: string) => void; disabled?: boolean; 'aria-label'?: string }) => (
    <input id={p.id} aria-label={p['aria-label']} value={p.value ?? ''} disabled={p.disabled} onChange={(e) => p.onValueChange(e.target.value)} />
  ),
}));

const declareAbsence = vi.fn();
const updateAbsence = vi.fn();
const fetchAbsences = vi.fn();
vi.mock('@/lib/queries/agent-crm', async (original) => ({
  ...(await original<typeof import('@/lib/queries/agent-crm')>()),
  fetchAbsences: (...a: unknown[]) => fetchAbsences(...a),
  declareAbsence: (...a: unknown[]) => declareAbsence(...a),
  updateAbsence: (...a: unknown[]) => updateAbsence(...a),
}));
const fetchAdminUsers = vi.fn();
vi.mock('@/lib/queries/admin-users', () => ({ fetchAdminUsers: (...a: unknown[]) => fetchAdminUsers(...a) }));

const membre = (id: number, first_name: string, last_name: string, biens: number): AdminAgencyUserRow => ({
  id,
  first_name,
  last_name,
  email: null,
  phone: null,
  status: 'active',
  last_login_at: null,
  created_at: '2026-01-01T00:00:00Z',
  agent_profiles: [{ agency_id: AGENCE, status: 'active' }],
  properties_followed_count: biens,
});
const PAPE = membre(4, 'Pape', 'Cissé', 18);
const KHADY = membre(5, 'Khady', 'Diallo', 14);
const MAMADOU = membre(6, 'Mamadou', 'Ndiaye', 31);

const CIBLE: CibleDAbsence = { absentId: 4, absentNom: 'Pape Cissé' };

function monter(peutDeleguer: boolean, cible: CibleDAbsence = CIBLE, garde?: GardeDoubleFacteurFn) {
  const onFermer = vi.fn();
  const arbre = (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CouvrirUneAbsence agencyId={AGENCE} peutDeleguer={peutDeleguer} cible={cible} onFermer={onFermer} />
    </QueryClientProvider>
  );
  render(withIntl(garde ? <ContexteGardeDoubleFacteur.Provider value={garde}>{arbre}</ContexteGardeDoubleFacteur.Provider> : arbre));
  return { onFermer };
}

async function choisirKhadyEtLaFin(fin = '2026-12-14') {
  await userEvent.click(await screen.findByRole('radio', { name: /Khady Diallo/ }));
  await userEvent.type(screen.getByLabelText('Au (inclus)'), fin);
}

beforeEach(() => {
  declareAbsence.mockReset().mockResolvedValue({});
  updateAbsence.mockReset().mockResolvedValue({});
  fetchAbsences.mockReset().mockResolvedValue([]);
  fetchAdminUsers.mockReset().mockResolvedValue({ data: [PAPE, KHADY, MAMADOU], meta: { current_page: 1, last_page: 1, total: 3 } });
});
afterEach(() => vi.useRealTimers());

describe('CouvrirUneAbsence', () => {
  // Vérification de 776dc214f (D2) — le remplaçant se choisit parmi le personnel EN EXERCICE
  // (`filter[assignable]=1`) : un membre suspendu dans l'agence (compte actif, profil suspendu) n'est
  // pas proposé ; `filter[status]=active`, qui ne juge que le compte, le proposait, et l'API le
  // refusait ensuite (422 `substitute_id`). Le serveur filtre : le double ne rend le suspendu que
  // si la requête ne demande pas le personnel en exercice.
  it('D2 — un membre suspendu dans l’agence n’est pas proposé comme remplaçant', async () => {
    const SUSPENDU = { ...membre(7, 'Abdoulaye', 'Gueye', 13), agent_profiles: [{ agency_id: AGENCE, status: 'suspended' }] } as AdminAgencyUserRow;
    fetchAdminUsers.mockImplementation(async (params: { assignable?: boolean }) => {
      const data = params.assignable ? [PAPE, KHADY, MAMADOU] : [PAPE, KHADY, MAMADOU, SUSPENDU];
      return { data, meta: { current_page: 1, last_page: 1, total: data.length } };
    });
    monter(true);
    expect(await screen.findByRole('radio', { name: /Khady Diallo/ })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Abdoulaye Gueye/ })).not.toBeInTheDocument();
    expect(fetchAdminUsers.mock.calls[0][0]).toMatchObject({ role: 'agent,agency_admin', assignable: true });
    expect(fetchAdminUsers.mock.calls[0][0]).not.toHaveProperty('status');
  });

  it('AC1 — la case cochée envoie substitute_can_act: true, avec la fin au soir du jour choisi', async () => {
    const { onFermer } = monter(true);

    await choisirKhadyEtLaFin();
    await userEvent.click(screen.getByRole('checkbox', { name: /Khady peut agir à sa place pendant l’absence/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’absence' }));

    await waitFor(() => expect(declareAbsence).toHaveBeenCalledTimes(1));
    expect(declareAbsence.mock.calls[0][2]).toEqual({
      user_id: 4,
      substitute_id: 5,
      ends_at: '2026-12-14 23:59:59',
      reason: null,
      substitute_can_act: true,
    });
    await waitFor(() => expect(onFermer).toHaveBeenCalled());
  });

  it('la case dit le rôle prêté et le soir où le droit s’arrête', async () => {
    monter(true);
    await choisirKhadyEtLaFin();

    expect(screen.getByText(/Khady reçoit le rôle « Agent » de Pape dans l’agence, en plus du sien\./)).toBeInTheDocument();
    expect(screen.getByText(/Ce droit s’arrête seul le 14 déc\. au soir\./)).toBeInTheDocument();
  });

  it('AC2 — sans le droit de déléguer, ni case ni substitute_can_act dans l’envoi', async () => {
    monter(false);

    await choisirKhadyEtLaFin();
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’absence' }));

    await waitFor(() => expect(declareAbsence).toHaveBeenCalledTimes(1));
    expect(declareAbsence.mock.calls[0][2]).not.toHaveProperty('substitute_can_act');
  });

  it('un début futur part en starts_at ; aujourd’hui est immédiat et ne part pas', async () => {
    monter(false);
    await choisirKhadyEtLaFin('2027-01-20');
    fireEvent.change(screen.getByLabelText('Du'), { target: { value: '2027-01-10' } });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’absence' }));

    await waitFor(() => expect(declareAbsence).toHaveBeenCalledTimes(1));
    expect(declareAbsence.mock.calls[0][2]).toMatchObject({ starts_at: '2027-01-10', ends_at: '2027-01-20 23:59:59' });
  });

  it('sans remplaçant ni fin, rien ne part et le formulaire le dit', async () => {
    monter(true);
    await screen.findByRole('radio', { name: /Khady Diallo/ });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’absence' }));

    expect(declareAbsence).not.toHaveBeenCalled();
    expect(screen.getByText('Choisissez qui reprend ses nouvelles demandes.')).toBeInTheDocument();
    expect(screen.getByText('Choisissez le dernier jour de l’absence.')).toBeInTheDocument();
  });

  it('les disponibles d’abord, le portefeuille le plus léger en tête ; l’absent n’est pas proposé', async () => {
    fetchAbsences.mockResolvedValue([
      {
        id: 9,
        absent: { id: 5, name: 'Khady Diallo' },
        substitute: null,
        starts_at: '2026-12-22T00:00:00Z',
        ends_at: '2026-12-26T23:59:59Z',
        status: 'scheduled',
        reason: null,
      },
    ]);
    monter(true);

    await waitFor(() => expect(screen.getByRole('radio', { name: /Khady Diallo/ })).toHaveAccessibleName(/absence prévue du 22 déc\. au 26 déc\./));
    const noms = screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent ?? '');
    expect(noms[0]).toMatch(/Mamadou Ndiaye/);
    expect(noms[0]).toMatch(/portefeuille le plus chargé/);
    expect(noms[1]).toMatch(/Khady Diallo/);
    expect(screen.queryByRole('radio', { name: /Pape Cissé/ })).toBeNull();
  });

  it('modifier n’envoie que ce qui change, et le début d’une absence commencée ne se change pas', async () => {
    const ABSENCE: AgentAbsence = {
      id: 30,
      absent: { id: 4, name: 'Pape Cissé' },
      substitute: { id: 5, name: 'Khady Diallo' },
      starts_at: '2026-11-10T00:00:00Z',
      ends_at: '2026-12-14T23:59:59Z',
      status: 'active',
      reason: 'Congé',
      substitute_can_act: true,
      delegation_id: 31,
    };
    monter(true, { ...CIBLE, absence: ABSENCE });

    expect(await screen.findByText('Modifier l’absence')).toBeInTheDocument();
    expect(screen.getByLabelText('Du')).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeChecked();
    const au = screen.getByLabelText('Au (inclus)');
    await userEvent.clear(au);
    await userEvent.type(au, '2026-12-20');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’absence' }));

    await waitFor(() => expect(updateAbsence).toHaveBeenCalledTimes(1));
    expect(updateAbsence.mock.calls[0].slice(1)).toEqual([AGENCE, 30, { ends_at: '2026-12-20 23:59:59' }]);
  });

  it('une modification sans changement ne part pas et ferme', async () => {
    const ABSENCE: AgentAbsence = {
      id: 30,
      absent: { id: 4, name: 'Pape Cissé' },
      substitute: { id: 5, name: 'Khady Diallo' },
      starts_at: '2026-12-22T00:00:00Z',
      ends_at: '2026-12-26T23:59:59Z',
      status: 'scheduled',
      reason: null,
      substitute_can_act: false,
    };
    const { onFermer } = monter(true, { ...CIBLE, absence: ABSENCE });
    await screen.findByRole('radio', { name: /Khady Diallo/ });
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’absence' }));

    await waitFor(() => expect(onFermer).toHaveBeenCalled());
    expect(updateAbsence).not.toHaveBeenCalled();
  });

  it('la déclaration refusée par le second facteur passe par la garde, puis est rejouée', async () => {
    declareAbsence.mockRejectedValueOnce(new ApiError(403, { code: 'two_factor_required', message: 'Second facteur requis.' }));
    const garde = vi.fn<GardeDoubleFacteurFn>(async () => true);
    monter(false, CIBLE, garde);

    await choisirKhadyEtLaFin();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’absence' }));

    await waitFor(() => expect(declareAbsence).toHaveBeenCalledTimes(2));
    expect(garde).toHaveBeenCalledTimes(1);
  });

  it('un refus de l’API s’affiche, la fenêtre reste ouverte', async () => {
    declareAbsence.mockRejectedValueOnce(new ApiError(422, { message: 'Pape a déjà une absence sur ces dates.' }));
    const { onFermer } = monter(false);

    await choisirKhadyEtLaFin();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer l’absence' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Pape a déjà une absence sur ces dates.');
    expect(onFermer).not.toHaveBeenCalled();
  });
});
