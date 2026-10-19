/**
 * TCK-953 (ADR-0070 § 8) — l'API ne rend plus le numéro de pièce, seulement son masque. Le champ
 * s'écrit sans se relire : vide par défaut, vide veut dire « inchangé ». Une fiche qui porte déjà
 * un numéro s'enregistre donc sans le ressaisir ; une fiche typée sans numéro est encore refusée.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { CustomerDetail } from '@/types/customer';
import { CustomerForm } from '../CustomerForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

const createCustomerAction = vi.fn();
const updateCustomerAction = vi.fn();
vi.mock('@/app/actions/dashboard-customers', () => ({
  createCustomerAction: (...args: unknown[]) => createCustomerAction(...args),
  updateCustomerAction: (...args: unknown[]) => updateCustomerAction(...args),
}));

const fiche = {
  id: 7,
  first_name: 'Awa',
  last_name: 'Diop',
  email: null,
  phone: '+221771234567',
  status: 'active',
  pipeline_stage: 'lead',
  occupation: null,
  created_at: '2026-10-18T10:00:00Z',
  birth_date: null,
  id_type: 'id_card',
  id_number_masked: '•••• 8877',
  emergency_contact_name: null,
  emergency_contact_phone: null,
  added_by_id: 1,
  user_id: null,
  metadata: null,
} satisfies CustomerDetail;

describe('CustomerForm — numéro de pièce masqué', () => {
  beforeEach(() => {
    createCustomerAction.mockReset();
    updateCustomerAction.mockReset();
  });

  it('enregistre une fiche qui porte déjà un numéro sans le renvoyer', async () => {
    updateCustomerAction.mockResolvedValueOnce({ ok: true, data: fiche });
    const user = userEvent.setup();
    render(withIntl(<CustomerForm mode="edit" customer={fiche} onSuccess={vi.fn()} />));

    const champ = screen.getByLabelText('Numéro');
    expect(champ).toHaveValue('');
    expect(champ).toHaveAttribute('placeholder', expect.stringContaining('•••• 8877'));

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateCustomerAction).toHaveBeenCalledTimes(1));
    const corps = updateCustomerAction.mock.calls[0][1] as Record<string, unknown>;
    expect(corps).toMatchObject({ id_type: 'id_card' });
    expect(corps.id_number).toBeUndefined();
  });

  it('envoie le numéro ressaisi', async () => {
    updateCustomerAction.mockResolvedValueOnce({ ok: true, data: fiche });
    const user = userEvent.setup();
    render(withIntl(<CustomerForm mode="edit" customer={fiche} onSuccess={vi.fn()} />));

    await user.type(screen.getByLabelText('Numéro'), 'SN-112233');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateCustomerAction).toHaveBeenCalledTimes(1));
    expect(updateCustomerAction.mock.calls[0][1]).toMatchObject({ id_number: 'SN-112233' });
  });

  it('refuse encore une fiche typée sans aucun numéro', async () => {
    const user = userEvent.setup();
    render(withIntl(<CustomerForm mode="edit" customer={{ ...fiche, id_number_masked: null }} onSuccess={vi.fn()} />));

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(await screen.findByText('Numéro requis lorsqu’un type de pièce est sélectionné.')).toBeInTheDocument();
    expect(updateCustomerAction).not.toHaveBeenCalled();
  });
});
