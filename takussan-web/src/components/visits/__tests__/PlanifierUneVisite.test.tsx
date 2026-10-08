/**
 * TCK-590 — « Planifier une visite » : le personnel planifie POUR un client ou un prospect (nom +
 * téléphone), à l'heure de Dakar. Le navigateur est à Paris : un vert pris à UTC ne distinguerait
 * pas les deux fuseaux.
 */
process.env.TZ = 'Europe/Paris';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { PlanifierUneVisite } from '../PlanifierUneVisite';

const plan = { mutateAsync: vi.fn().mockResolvedValue({}), isPending: false };
const toastAdd = vi.fn();
const recherches: string[] = [];

/** Le profil ACTIF de l'appelant (passe 2, n4) : c'est lui, et non les rôles globaux, qui décide. */
const actif = vi.hoisted(() => ({ type: 'agent', status: 'active', agency_id: 3 as number | null }));
vi.mock('@/hooks/useProfiles', () => ({
  useMyProfiles: () => ({
    data: {
      data: [
        { id: 'owner:1', type: 'owner', numeric_id: 1, agency_id: 3, status: 'active', created_at: null },
        { id: 'actif:9', numeric_id: 9, created_at: null, ...actif },
      ],
      meta: { active_profile_id: 'actif:9', count: 2 },
    },
  }),
}));
vi.mock('@/lib/queries/visits', () => ({ usePlanVisit: () => plan }));
vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ add: toastAdd }) }));
vi.mock('@/hooks/useApiQuery', () => ({
  useApiQuery: (_key: unknown, chemin: string, options: { params: { filter: Record<string, string> } }) => {
    recherches.push(`${chemin}:${options.params.filter.search ?? ''}`);
    return chemin === '/api/properties'
      ? { data: { data: [{ id: 10, title: 'Villa à Almadies' }] } }
      : { data: { data: [{ id: 45, first_name: 'Awa', last_name: 'Diop' }] } };
  },
}));

async function ouvrir(ui: React.ReactElement) {
  const user = userEvent.setup();
  render(withIntl(ui));
  await user.click(screen.getByRole('button', { name: 'Planifier une visite' }));
  await screen.findByRole('dialog');
  return user;
}

describe('<PlanifierUneVisite> — TCK-590', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recherches.length = 0;
    Object.assign(actif, { type: 'agent', status: 'active', agency_id: 3 });
  });

  it('un bailleur n’a pas le bouton : l’API ne le laisse pas planifier pour un tiers', () => {
    Object.assign(actif, { type: 'owner' });
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('passe 2 (n4) — un agent SUSPENDU n’a pas le bouton : l’API le traite en non-personnel', () => {
    Object.assign(actif, { status: 'suspended' });
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={3} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('passe 2 (n4) — le profil actif d’une AUTRE agence que celle du bien n’a pas le bouton', () => {
    Object.assign(actif, { agency_id: 4 });
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={3} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('passe 2 (n4) — un bien sans agence n’a aucun personnel : pas de bouton', () => {
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={null} />));
    expect(screen.queryByRole('button', { name: 'Planifier une visite' })).not.toBeInTheDocument();
  });

  it('passe 2 (n4) — l’admin actif de l’agence du bien a le bouton', () => {
    Object.assign(actif, { type: 'agency_admin' });
    render(withIntl(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} agencyId={3} />));
    expect(screen.getByRole('button', { name: 'Planifier une visite' })).toBeInTheDocument();
  });

  it('depuis la fiche bien, pour un prospect : nom + téléphone, 10:00 à Dakar', async () => {
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-12' } });
    await user.selectOptions(screen.getByLabelText(/^Heure/), '10:00');
    await user.type(screen.getByLabelText('Nom du prospect'), 'Moussa Fall');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Planifier' }));

    await waitFor(() =>
      expect(plan.mutateAsync).toHaveBeenCalledWith({
        property_id: 10,
        scheduled_at: '2026-11-12T10:00:00Z',
        visitor_name: 'Moussa Fall',
        visitor_phone: '+221771234567',
      }),
    );
    expect(toastAdd).toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }));
  });

  it('passe 3 (R1) — la visite est planifiée mais le SMS retenu : l’agent le sait', async () => {
    plan.mutateAsync.mockResolvedValueOnce({ data: { id: 5 }, sms_sent: false, sms_code: 'visit_sms_capped' });
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);

    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-12' } });
    await user.selectOptions(screen.getByLabelText(/^Heure/), '10:00');
    await user.type(screen.getByLabelText('Nom du prospect'), 'Moussa Fall');
    await user.type(screen.getByLabelText('Téléphone'), '771234567');
    await user.click(screen.getByRole('button', { name: 'Planifier' }));

    await waitFor(() =>
      expect(toastAdd).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Le SMS au visiteur n’est pas parti.', type: 'warning' }),
      ),
    );
  });

  it('depuis la fiche client : le client est fixé, on cherche le bien', async () => {
    const user = await ouvrir(<PlanifierUneVisite customer={{ id: 45, libelle: 'Awa Diop' }} />);

    expect(screen.queryByLabelText('Nom du prospect')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'Rechercher un bien' }), 'Villa');
    expect(recherches).toContain('/api/properties:Villa');
    await user.selectOptions(screen.getByLabelText('Bien'), '10');
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2026-11-12' } });
    await user.selectOptions(screen.getByLabelText(/^Heure/), '15:30');
    await user.click(screen.getByRole('button', { name: 'Planifier' }));

    await waitFor(() =>
      expect(plan.mutateAsync).toHaveBeenCalledWith({
        property_id: 10,
        scheduled_at: '2026-11-12T15:30:00Z',
        customer_id: 45,
      }),
    );
  });

  it('incomplet : rien ne part', async () => {
    const user = await ouvrir(<PlanifierUneVisite property={{ id: 10, libelle: 'Villa à Almadies' }} />);
    await user.click(screen.getByRole('button', { name: 'Planifier' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(plan.mutateAsync).not.toHaveBeenCalled();
  });

  it('la grille d’heures est celle du serveur : 09:00 → 18:30, toutes les 30 minutes', async () => {
    await ouvrir(<PlanifierUneVisite />);
    const heures = Array.from((screen.getByLabelText(/^Heure/) as HTMLSelectElement).options).map((o) => o.value);
    expect(heures).toHaveLength(20);
    expect(heures[0]).toBe('09:00');
    expect(heures.at(-1)).toBe('18:30');
  });
});
