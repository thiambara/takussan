/**
 * TCK-504 — le panneau « Agent principal » de la fiche pro : voir qui répond et pourquoi, désigner
 * un autre agent en un geste, comprendre ce que ça change, et lire le refus du serveur.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api';
import type { PropertyCollaboratorsPayload } from '@/lib/queries/property-collaborators';
import { withIntl } from '@/test/intl';
import { PropertyCollaboratorsPanel } from '../PropertyCollaboratorsPanel';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton', isLoading: false }),
}));
const fetchPropertyCollaborators = vi.fn();
const designatePrimaryCollaborator = vi.fn();
vi.mock('@/lib/queries/property-collaborators', async (original) => ({
  ...(await original<typeof import('@/lib/queries/property-collaborators')>()),
  fetchPropertyCollaborators: (...a: unknown[]) => fetchPropertyCollaborators(...a),
  designatePrimaryCollaborator: (...a: unknown[]) => designatePrimaryCollaborator(...a),
}));

const ligne = (id: number, prenom: string, role: string, isPrimary = false) => ({
  id,
  user_id: 100 + id,
  role,
  is_primary: isPrimary,
  commission_share: null,
  user: { id: 100 + id, first_name: prenom, last_name: 'Diop', username: null },
});

const parOrdre: PropertyCollaboratorsPayload = {
  data: [ligne(1, 'Awa', 'agent'), ligne(2, 'Moussa', 'agent'), ligne(3, 'Fatou', 'viewer')] as never,
  primary_contact: { user_id: 101, collaborator_id: 1, designated_collaborator_id: null, source: 'invitation_order' },
  can_designate: true,
};

const moussaDesigne: PropertyCollaboratorsPayload = {
  data: [ligne(1, 'Awa', 'agent'), ligne(2, 'Moussa', 'agent', true), ligne(3, 'Fatou', 'viewer')] as never,
  primary_contact: { user_id: 102, collaborator_id: 2, designated_collaborator_id: 2, source: 'designated' },
  can_designate: true,
};

function rendu() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(withIntl(
    <QueryClientProvider client={client}>
      <PropertyCollaboratorsPanel propertyId={7} />
    </QueryClientProvider>,
  ));
}

describe('PropertyCollaboratorsPanel', () => {
  beforeEach(() => {
    fetchPropertyCollaborators.mockReset();
    designatePrimaryCollaborator.mockReset();
  });

  it('dit ce que le choix change, et qui répond sans choix — sans alerte', async () => {
    fetchPropertyCollaborators.mockResolvedValue(parOrdre);
    rendu();

    expect(await screen.findByTestId('primary-contact-source')).toHaveTextContent(
      "Aucun choix n'est posé : l'agent associé au bien le premier répond.",
    );
    expect(screen.getByText(/la fiche publique du bien nomme, qui reçoit les messages/)).toBeInTheDocument();
    expect(within(screen.getByTestId('collaborator-1')).getByText('Répond par défaut')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('seul un agent non désigné porte le geste ; un lecteur, jamais', async () => {
    fetchPropertyCollaborators.mockResolvedValue(moussaDesigne);
    rendu();

    const moussa = await screen.findByTestId('collaborator-2');
    expect(within(moussa).getByText('Agent principal')).toBeInTheDocument();
    expect(within(moussa).queryByRole('button')).toBeNull();
    expect(within(screen.getByTestId('collaborator-1')).getByRole('button', { name: 'Désigner Awa Diop comme agent principal' })).toBeInTheDocument();
    expect(within(screen.getByTestId('collaborator-3')).queryByRole('button')).toBeNull();
    expect(within(screen.getByTestId('collaborator-3')).getByText('Lecture seule')).toBeInTheDocument();
    expect(screen.getByTestId('primary-contact-source')).toHaveTextContent("Choisi par l'agence.");
  });

  it('désigner appelle l’API pour CETTE ligne et affiche la réponse du serveur', async () => {
    // La relecture qui suit la désignation rend l'état du serveur, désormais désigné.
    fetchPropertyCollaborators.mockResolvedValueOnce(parOrdre).mockResolvedValue(moussaDesigne);
    designatePrimaryCollaborator.mockResolvedValue(moussaDesigne);
    rendu();

    await userEvent.click(await screen.findByRole('button', { name: 'Désigner Moussa Diop comme agent principal' }));

    expect(designatePrimaryCollaborator).toHaveBeenCalledWith('jeton', 7, 2);
    await waitFor(() =>
      expect(within(screen.getByTestId('collaborator-2')).getByText('Agent principal')).toBeInTheDocument(),
    );
    expect(screen.getByTestId('primary-contact-source')).toHaveTextContent("Choisi par l'agence.");
  });

  it('affiche le refus du serveur tel quel', async () => {
    fetchPropertyCollaborators.mockResolvedValue(parOrdre);
    designatePrimaryCollaborator.mockRejectedValue(new ApiError(422, {
      code: 'property.primary_not_eligible',
      message: "Seul un agent actif de l'agence du bien peut en être l'agent principal.",
    }));
    rendu();

    await userEvent.click(await screen.findByRole('button', { name: 'Désigner Moussa Diop comme agent principal' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("Seul un agent actif de l'agence du bien peut en être l'agent principal.");
  });

  it('sans collaborateur, le propriétaire répond, sobrement', async () => {
    fetchPropertyCollaborators.mockResolvedValue({ data: [], primary_contact: { user_id: 9, collaborator_id: null, designated_collaborator_id: null, source: 'owner' }, can_designate: true });
    rendu();

    expect(await screen.findByText("Aucun collaborateur n'est associé à ce bien.")).toBeInTheDocument();
    expect(screen.getByTestId('primary-contact-source')).toHaveTextContent('le propriétaire répond');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('sans le droit de désigner, aucun bouton — mais qui répond reste dit', async () => {
    // Vérification adverse m2 : un agent lit la liste sans tenir `update` du bien.
    fetchPropertyCollaborators.mockResolvedValue({ ...parOrdre, can_designate: false });
    rendu();

    expect(await screen.findByTestId('primary-contact-source')).toHaveTextContent("Aucun choix n'est posé");
    expect(within(screen.getByTestId('collaborator-1')).getByText('Répond par défaut')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('une marque sur un agent inactif est dite indisponible, et le repli porte le badge de qui répond', async () => {
    // Vérification adverse m3 : la forme exacte que l'API rend après la suspension du désigné.
    fetchPropertyCollaborators.mockResolvedValue({
      data: [ligne(1, 'Awa', 'agent'), ligne(2, 'Moussa', 'agent', true)],
      primary_contact: { user_id: 101, collaborator_id: 1, designated_collaborator_id: 2, source: 'designated_unavailable' },
      can_designate: true,
    });
    rendu();

    expect(await screen.findByTestId('primary-contact-source')).toHaveTextContent(
      "L'agent choisi par l'agence n'est plus actif : l'agent associé au bien le premier répond à sa place",
    );
    expect(screen.getByTestId('primary-contact-source')).not.toHaveTextContent("Aucun choix n'est posé");
    const moussa = screen.getByTestId('collaborator-2');
    expect(within(moussa).getByText('Choisi, indisponible')).toBeInTheDocument();
    expect(within(moussa).queryByText('Agent principal')).toBeNull();
    expect(within(screen.getByTestId('collaborator-1')).getByText('Répond par défaut')).toBeInTheDocument();
  });

  it('marque indisponible et aucun autre agent : le propriétaire répond à sa place', async () => {
    fetchPropertyCollaborators.mockResolvedValue({
      data: [ligne(2, 'Moussa', 'agent', true)],
      primary_contact: { user_id: 9, collaborator_id: null, designated_collaborator_id: 2, source: 'designated_unavailable' },
      can_designate: true,
    });
    rendu();

    expect(await screen.findByTestId('primary-contact-source')).toHaveTextContent('le propriétaire répond à sa place');
    expect(within(screen.getByTestId('collaborator-2')).getByText('Choisi, indisponible')).toBeInTheDocument();
  });

  it('se tait sur un refus de lecture', async () => {
    fetchPropertyCollaborators.mockRejectedValue(new ApiError(403, { message: 'Forbidden' }));
    rendu();
    await waitFor(() => expect(screen.queryByTestId('property-collaborators')).toBeNull());
    expect(fetchPropertyCollaborators).toHaveBeenCalled();
  });
});
