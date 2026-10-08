/**
 * TCK-591 §1 et §5 — le formulaire client : téléphone saisi comme au profil (indicatif en préfixe,
 * valeur en E.164), doublon présenté comme une AIDE (la fiche existante, puis « Créer quand
 * même » qui renvoie `allow_duplicate`), et critères du prospect envoyés à l'API.
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

async function remplir() {
  const user = userEvent.setup();
  render(withIntl(<CustomerForm mode="create" onSuccess={vi.fn()} />));
  await user.type(screen.getByLabelText(/Prénom/), 'Awa');
  await user.type(screen.getByLabelText(/^Nom/), 'Diop');
  await user.type(screen.getByLabelText('Téléphone'), '77 123 45 67');
  return user;
}

describe('CustomerForm — doublon et critères', () => {
  beforeEach(() => createCustomerAction.mockReset());

  it('présente le doublon comme une aide, puis « Créer quand même » renvoie allow_duplicate', async () => {
    createCustomerAction
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        message: 'Un client de votre agence porte déjà ce téléphone ou cet e-mail.',
        duplicates: [
          { id: 5, name: 'Awa Diop', matched_on: 'phone' },
          { id: null, name: null, matched_on: 'phone' },
        ],
      })
      .mockResolvedValueOnce({ ok: true, data: { id: 9 } });
    const user = await remplir();

    await user.click(screen.getByRole('button', { name: 'Créer le client' }));

    expect(await screen.findByText("Ce client semble déjà exister dans l'agence.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir sa fiche' })).toHaveAttribute('href', '/app/customers/5');
    // Une fiche que l'appelant ne peut pas lire : on dit qu'elle existe, jamais qui elle est.
    expect(screen.getByText(/Une fiche que vous ne pouvez pas ouvrir/)).toBeInTheDocument();
    expect(createCustomerAction.mock.calls[0][0]).toMatchObject({ phone: '+221771234567' });
    expect(createCustomerAction.mock.calls[0][0]).not.toHaveProperty('allow_duplicate');

    await user.click(screen.getByRole('button', { name: 'Créer quand même' }));

    await waitFor(() => expect(createCustomerAction).toHaveBeenCalledTimes(2));
    expect(createCustomerAction.mock.calls[1][0]).toMatchObject({ allow_duplicate: true, phone: '+221771234567' });
  });

  it('envoie les critères saisis, et null pour ceux laissés vides', async () => {
    createCustomerAction.mockResolvedValueOnce({ ok: true, data: { id: 9 } });
    const user = await remplir();

    await user.type(screen.getByLabelText('Budget maximum (FCFA)'), '300000');
    await user.type(screen.getByLabelText('Villes'), 'Dakar, Thiès , Dakar');
    await user.click(screen.getByRole('button', { name: 'Appartement' }));
    await user.click(screen.getByRole('button', { name: 'Créer le client' }));

    await waitFor(() => expect(createCustomerAction).toHaveBeenCalledTimes(1));
    expect(createCustomerAction.mock.calls[0][0]).toMatchObject({
      budget_min: null,
      budget_max: 300000,
      seeking_cities: ['Dakar', 'Thiès'],
      seeking_neighborhoods: null,
      seeking_property_types: ['apartment'],
      seeking_contract_type: null,
      min_bedrooms: null,
    });
  });

  it('refuse un plafond inférieur au plancher avant tout appel', async () => {
    const user = await remplir();

    await user.type(screen.getByLabelText('Budget minimum (FCFA)'), '400000');
    await user.type(screen.getByLabelText('Budget maximum (FCFA)'), '300000');
    await user.click(screen.getByRole('button', { name: 'Créer le client' }));

    expect(await screen.findByText('Le budget maximum doit être supérieur ou égal au minimum.')).toBeInTheDocument();
    expect(createCustomerAction).not.toHaveBeenCalled();
  });

  /**
   * TCK-591 (verif-591 passe 2, N4) — l'API ne rend les critères qu'au personnel de l'agence. Une
   * fiche lue sans eux (le bailleur qui l'a ajoutée) n'en montre pas la section et ne les renvoie
   * pas : vides, ils effaçaient ceux de l'agent.
   */
  it("n'affiche ni ne renvoie les critères d'une fiche lue sans eux", async () => {
    updateCustomerAction.mockResolvedValue({ ok: true, data: { id: 4 } });
    const base = { id: 4, first_name: 'Awa', last_name: 'Diop', email: 'awa@example.sn', pipeline_stage: 'lead', status: 'active' };
    const user = userEvent.setup();

    const { unmount } = render(withIntl(<CustomerForm mode="edit" customer={base as unknown as CustomerDetail} onSuccess={vi.fn()} />));
    expect(screen.queryByLabelText('Budget maximum (FCFA)')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateCustomerAction).toHaveBeenCalledTimes(1));
    expect(updateCustomerAction.mock.calls[0][1]).toMatchObject({ first_name: 'Awa' });
    expect(updateCustomerAction.mock.calls[0][1]).not.toHaveProperty('budget_max');
    expect(updateCustomerAction.mock.calls[0][1]).not.toHaveProperty('seeking_cities');
    unmount();

    // Le personnel, qui les lit, les voit et les renvoie.
    const lue = { ...base, budget_max: '300000.00', seeking_cities: ['Dakar'] };
    render(withIntl(<CustomerForm mode="edit" customer={lue as unknown as CustomerDetail} onSuccess={vi.fn()} />));
    expect(screen.getByLabelText('Budget maximum (FCFA)')).toHaveValue('300000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(updateCustomerAction).toHaveBeenCalledTimes(2));
    expect(updateCustomerAction.mock.calls[1][1]).toMatchObject({ budget_max: 300000, seeking_cities: ['Dakar'] });
  });
});
