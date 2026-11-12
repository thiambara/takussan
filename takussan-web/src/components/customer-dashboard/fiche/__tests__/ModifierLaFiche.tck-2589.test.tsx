/**
 * TCK-2589 (lot D2) — « Modifier » de la fiche client, dans le panneau de droite :
 *  · 9a — quatre sections : Identité et Ce qu'il cherche ouvertes, Contact et Pièce repliées sur leur
 *    résumé ; une section repliée qui porte une erreur (422) s'ouvre ;
 *  · 8a / AC3 — pas d'étape dans la feuille ; l'envoi porte les champs d'aujourd'hui MOINS l'étape,
 *    le statut compris ;
 *  · 10a — la garde de sortie : une saisie modifiée ne se ferme qu'après « Abandonner » ; non
 *    modifiée, elle se ferme d'un geste ;
 *  · enregistrée : le panneau se ferme et la page se relit.
 */
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withIntl } from '@/test/intl';
import type { CustomerDetail } from '@/types/customer';

const nav = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: nav.refresh, back: vi.fn() }) }));
const actions = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock('@/app/actions/dashboard-customers', () => ({
  createCustomerAction: vi.fn(),
  updateCustomerAction: (...a: unknown[]) => actions.update(...a),
}));
vi.mock('@/components/customer-form/RevelationNumeroDePiece', () => ({ RevelationNumeroDePiece: () => <button type="button">Afficher</button> }));

import { ModifierLaFiche } from '../ModifierLaFiche';

const MARIAMA = {
  id: 7,
  first_name: 'Mariama',
  last_name: 'Fall',
  email: 'mariama.fall@example.test',
  phone: '+221706482056',
  status: 'active',
  pipeline_stage: 'qualified',
  occupation: 'Enseignante',
  created_at: '2026-11-03T10:00:00Z',
  birth_date: null,
  id_type: 'id_card',
  id_number_masked: '•••• 4821',
  emergency_contact_name: null,
  emergency_contact_phone: null,
  added_by_id: 2,
  user_id: null,
  metadata: null,
  locale: null,
  seeking_contract_type: 'rent',
  budget_min: null,
  budget_max: '250000.00',
  seeking_property_types: ['studio'],
  seeking_cities: ['Dakar'],
  seeking_neighborhoods: ['Mermoz'],
  min_bedrooms: null,
} as unknown as CustomerDetail;

const fermetures = vi.fn();

function Tenue({ peutReveler = false }: { readonly peutReveler?: boolean }) {
  const [ouvert, setOuvert] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)}>
        rouvrir
      </button>
      <ModifierLaFiche
        customer={MARIAMA}
        open={ouvert}
        onOpenChange={(o) => {
          if (!o) fermetures();
          setOuvert(o);
        }}
        peutReveler={peutReveler}
      />
    </>
  );
}

const panneau = () => screen.getByRole('dialog', { name: 'Modifier la fiche' });
const section = (nom: string) => within(panneau()).getByRole('button', { name: new RegExp(`^${nom}`) });

beforeEach(() => {
  vi.clearAllMocks();
  actions.update.mockResolvedValue({ ok: true, data: MARIAMA });
});

describe('TCK-2589 (lot D2) — « Modifier » de la fiche client', () => {
  it('9a — Identité et Ce qu’il cherche ouvertes ; Contact et Pièce repliées sur leur résumé', () => {
    render(withIntl(<Tenue />));
    expect(section('Identité')).toHaveAttribute('aria-expanded', 'true');
    expect(section('Ce qu’il cherche')).toHaveAttribute('aria-expanded', 'true');
    expect(section('Contact')).toHaveAttribute('aria-expanded', 'false');
    expect(section('Contact')).toHaveTextContent('mariama.fall@example.test');
    expect(section('Pièce d’identité')).toHaveAttribute('aria-expanded', 'false');
    expect(section('Pièce d’identité')).toHaveTextContent('•••• 4821');
    // Les champs de la création (TCK-2590) : Louer / Acheter, en radios.
    expect(within(panneau()).getByRole('radio', { name: 'Louer' })).toHaveAttribute('aria-checked', 'true');
  });

  it('8a / AC3 — aucune étape dans la feuille ; l’envoi porte les champs moins l’étape, le statut compris', async () => {
    const user = userEvent.setup();
    render(withIntl(<Tenue />));
    expect(within(panneau()).queryByText('Étape du pipeline')).toBeNull();
    expect(within(panneau()).queryByRole('combobox', { name: /Étape/ })).toBeNull();

    await user.clear(within(panneau()).getByLabelText(/^Prénom/));
    await user.type(within(panneau()).getByLabelText(/^Prénom/), 'Mariam');
    await user.click(within(panneau()).getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() => expect(actions.update).toHaveBeenCalledTimes(1));
    const [id, corps] = actions.update.mock.calls[0];
    expect(id).toBe(7);
    expect(corps).not.toHaveProperty('pipeline_stage');
    expect(corps).toMatchObject({ first_name: 'Mariam', last_name: 'Fall', status: 'active', phone: '+221706482056', email: 'mariama.fall@example.test' });
    expect(corps).toMatchObject({ seeking_contract_type: 'rent', seeking_property_types: ['studio'] });
    // Enregistrée : le panneau se ferme, la page se relit.
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Modifier la fiche' })).toBeNull());
    expect(nav.refresh).toHaveBeenCalledTimes(1);
  });

  it('9a — une erreur sur un champ d’une section repliée l’ouvre, l’erreur lisible', async () => {
    actions.update.mockResolvedValue({ ok: false, status: 422, message: 'Données invalides', errors: { phone: ['Ce numéro est déjà utilisé.'] } });
    const user = userEvent.setup();
    render(withIntl(<Tenue />));
    expect(section('Contact')).toHaveAttribute('aria-expanded', 'false');
    await user.click(within(panneau()).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(section('Contact')).toHaveAttribute('aria-expanded', 'true'));
    expect(within(panneau()).getByText('Ce numéro est déjà utilisé.')).toBeVisible();
  });

  it('10a — modifiée, la fermer demande d’abord : « Continuer la saisie » garde tout, « Abandonner » ferme', async () => {
    const user = userEvent.setup();
    render(withIntl(<Tenue />));
    await user.type(within(panneau()).getByLabelText(/^Prénom/), 'x');

    await user.click(within(panneau()).getByRole('button', { name: 'Annuler' }));
    const garde = await screen.findByRole('dialog', { name: 'Abandonner les modifications ?' });
    expect(fermetures).not.toHaveBeenCalled();
    await user.click(within(garde).getByRole('button', { name: 'Continuer la saisie' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Abandonner les modifications ?' })).toBeNull());
    expect(within(panneau()).getByLabelText(/^Prénom/)).toHaveValue('Mariamax');

    await user.keyboard('{Escape}');
    const encore = await screen.findByRole('dialog', { name: 'Abandonner les modifications ?' });
    expect(fermetures).not.toHaveBeenCalled();
    await user.click(within(encore).getByRole('button', { name: 'Abandonner' }));
    await waitFor(() => expect(fermetures).toHaveBeenCalledTimes(1));
    expect(actions.update).not.toHaveBeenCalled();

    // Rouverte : la saisie abandonnée n'a pas survécu.
    await user.click(screen.getByRole('button', { name: 'rouvrir' }));
    expect(within(panneau()).getByLabelText(/^Prénom/)).toHaveValue('Mariama');
  });

  it('10a — non modifiée, elle se ferme d’un geste, sans question', async () => {
    const user = userEvent.setup();
    render(withIntl(<Tenue />));
    await user.click(within(panneau()).getByRole('button', { name: 'Annuler' }));
    await waitFor(() => expect(fermetures).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('dialog', { name: 'Abandonner les modifications ?' })).toBeNull();
  });

  it('la pièce : « Afficher » à l’admin seul', async () => {
    const user = userEvent.setup();
    const { unmount } = render(withIntl(<Tenue />));
    await user.click(section('Pièce d’identité'));
    expect(within(panneau()).queryByRole('button', { name: 'Afficher' })).toBeNull();
    unmount();

    render(withIntl(<Tenue peutReveler />));
    await user.click(section('Pièce d’identité'));
    expect(within(panneau()).getByRole('button', { name: 'Afficher' })).toBeInTheDocument();
  });
});
