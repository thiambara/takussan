/**
 * TCK-1347 (P149.02) — en édition, vider l'e-mail ou la profession les efface : le corps porte
 * `null`, et non une clé absente que l'API lisait comme « garder ».
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { CustomerDetail } from '@/types/customer';
import { CustomerForm } from '../CustomerForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }) }));

const updateCustomerAction = vi.fn();
vi.mock('@/app/actions/dashboard-customers', () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: (...args: unknown[]) => updateCustomerAction(...args),
}));

const fiche = {
  id: 7,
  first_name: 'John',
  last_name: 'Smith',
  email: 'john@example.com',
  phone: '+221771234567',
  status: 'active',
  pipeline_stage: 'lead',
  occupation: 'Comptable',
  created_at: '2026-10-18T10:00:00Z',
  birth_date: null,
  id_type: null,
  id_number_masked: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  added_by_id: 1,
  user_id: null,
  metadata: null,
  locale: null,
} satisfies CustomerDetail;

describe('CustomerForm — effacer un champ en édition (TCK-1347)', () => {
  it('l’e-mail et la profession vidés partent à null ; le téléphone gardé reste', async () => {
    updateCustomerAction.mockResolvedValueOnce({ ok: true, data: fiche });
    const user = userEvent.setup();
    render(withIntl(<CustomerForm mode="edit" customer={fiche} onSuccess={vi.fn()} />));

    await user.clear(screen.getByLabelText('E-mail'));
    await user.clear(screen.getByLabelText('Profession'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(updateCustomerAction).toHaveBeenCalledTimes(1));
    const corps = updateCustomerAction.mock.calls[0][1];
    expect(corps).toMatchObject({ email: null, occupation: null, phone: '+221771234567' });
    expect(corps.id_type).toBeUndefined();
    expect(corps.id_number).toBeUndefined();
  });
});
