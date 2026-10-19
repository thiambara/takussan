/**
 * TCK-921 (P29.03) — la langue facultative de la fiche client : relue en édition et renvoyée telle
 * quelle, `null` à la création quand l'agent ne la choisit pas (le repli `fr` de l'API).
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
  first_name: 'John',
  last_name: 'Smith',
  email: null,
  phone: '+221771234567',
  status: 'active',
  pipeline_stage: 'lead',
  occupation: null,
  created_at: '2026-10-18T10:00:00Z',
  birth_date: null,
  id_type: null,
  id_number: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  added_by_id: 1,
  user_id: null,
  metadata: null,
  locale: 'en',
} satisfies CustomerDetail;

describe('CustomerForm — langue des messages', () => {
  beforeEach(() => {
    createCustomerAction.mockReset();
    updateCustomerAction.mockReset();
  });

  it('montre la langue de la fiche et la renvoie à l’enregistrement', async () => {
    updateCustomerAction.mockResolvedValueOnce({ ok: true, data: fiche });
    const user = userEvent.setup();
    render(withIntl(<CustomerForm mode="edit" customer={fiche} onSuccess={vi.fn()} />));

    expect(screen.getByLabelText('Langue des messages')).toHaveTextContent('Anglais');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateCustomerAction).toHaveBeenCalledTimes(1));
    expect(updateCustomerAction.mock.calls[0][1]).toMatchObject({ locale: 'en' });
  });

  it('envoie null à la création quand la langue n’est pas choisie', async () => {
    createCustomerAction.mockResolvedValueOnce({ ok: true, data: { id: 9 } });
    const user = userEvent.setup();
    render(withIntl(<CustomerForm mode="create" onSuccess={vi.fn()} />));
    await user.type(screen.getByLabelText(/Prénom/), 'Awa');
    await user.type(screen.getByLabelText(/^Nom/), 'Diop');
    await user.type(screen.getByLabelText('Téléphone'), '77 123 45 67');

    await user.click(screen.getByRole('button', { name: 'Créer le client' }));

    await waitFor(() => expect(createCustomerAction).toHaveBeenCalledTimes(1));
    expect(createCustomerAction.mock.calls[0][0]).toMatchObject({ locale: null });
  });
});
