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
