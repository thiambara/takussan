/**
 * TCK-2748 — la colonne « Infos du groupe » du bureau (maquette a-5) :
 *  - AC3 : chaque participant porte la relation au contexte que l'API sert (`participants` du
 *    contexte) ; absente, la ligne ne dit que « Vous » ou « admin du groupe », jamais une relation
 *    devinée ;
 *  - AC4 : « Quitter le groupe » est refusé à la dernière personne qui administre, avec la raison ;
 *    sinon le départ part (`DELETE …/participants/{moi}`) ;
 *  - les gestes d'administration (renommer, ajouter, gérer) n'existent que pour un admin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import type { Conversation, ConversationContext } from '@/types/message';
import { InfosDuGroupe } from '../InfosDuGroupe';

const retirer = vi.fn();
let conversation: Partial<Conversation>;
let contexte: ConversationContext;

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1 }, token: 'jeton' }),
}));

const { mutation } = vi.hoisted(() => ({ mutation: () => ({ mutate: () => {}, isPending: false }) }));
vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: conversation } }),
  useConversationContext: () => ({ data: { data: contexte }, isLoading: false }),
  useRenameConversation: mutation,
  useAddParticipants: mutation,
  useRemoveParticipant: () => ({ mutate: retirer, isPending: false }),
  useUpdateParticipantRole: mutation,
  useToggleMute: mutation,
  useMessagingContacts: () => ({ data: { data: [], meta: { total: 0 } }, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() }),
}));

function participant(user_id: number, nom: string, role: 'admin' | 'member' = 'member') {
  return { id: user_id * 10, user_id, role, last_read_at: null, joined_at: '2026-11-01', left_at: null, user: { id: user_id, full_name: nom, avatar_url: null } };
}

function ligne(userId: number) {
  return within(screen.getByTestId(`participant-${userId}`));
}

beforeEach(() => {
  retirer.mockReset();
  conversation = {
    id: 5,
    type: 'group',
    subject: 'Fuite sous évier',
    participants: [participant(1, 'Sokhna Sène', 'admin'), participant(2, 'Fatou Wade'), participant(3, 'Astou Sy'), participant(4, 'Ibou Fall')],
  };
  contexte = {
    property: { id: 31, slug: 'f2-grand-yoff', title: 'Appartement F2 · Grand Yoff', reference_number: null, price: null, status: null, cover_url: null },
    lease: null,
    maintenance: { id: 8, status: 'assigned', title: 'Fuite sous évier', scheduled_at: '2026-11-10T09:30:00+00:00' },
    participants: [
      { user_id: 1, relation: 'agent' },
      { user_id: 2, relation: 'locataire' },
      { user_id: 3, relation: 'prestataire', category: 'plumbing' },
    ],
  };
});

describe('<InfosDuGroupe> (TCK-2748)', () => {
  it('AC3 — chaque participant porte la relation servie par l’API, et rien de deviné', () => {
    render(withIntl(<InfosDuGroupe conversationId={5} />));

    expect(ligne(1).getByText('Vous · admin du groupe')).toBeInTheDocument();
    expect(ligne(2).getByText('Locataire')).toBeInTheDocument();
    expect(ligne(3).getByText('Prestataire · plomberie')).toBeInTheDocument();
    // Ibou Fall n'a aucune relation lisible : son nom, et rien d'autre.
    expect(screen.getByTestId('participant-4')).toHaveTextContent(/^IFIbou Fall$/);
    expect(screen.getByText('4 participants')).toBeInTheDocument();
  });

  it('montre l’intervention et le bien liés, en liens', () => {
    render(withIntl(<InfosDuGroupe conversationId={5} />));
    const objets = within(screen.getByTestId('objets-du-groupe'));
    expect(objets.getByRole('link', { name: /Intervention · planifiée/ })).toHaveAttribute('href', '/app/maintenance/8');
    expect(objets.getByRole('link', { name: /Appartement F2 · Grand Yoff/ })).toHaveAttribute('href', '/properties/f2-grand-yoff');
  });

  it('AC4 — la dernière personne qui administre ne peut pas partir, et on lui dit pourquoi', () => {
    render(withIntl(<InfosDuGroupe conversationId={5} />));
    const zone = within(screen.getByTestId('quitter-le-groupe'));
    expect(zone.queryByRole('button')).not.toBeInTheDocument();
    expect(zone.getByText(/nommez un autre admin avant de partir/)).toBeInTheDocument();
  });

  it('avec une autre personne qui administre, « Quitter le groupe » part', async () => {
    conversation.participants = [participant(1, 'Sokhna Sène', 'admin'), participant(2, 'Fatou Wade', 'admin'), participant(3, 'Astou Sy')];
    const user = userEvent.setup();
    render(withIntl(<InfosDuGroupe conversationId={5} />));
    await user.click(within(screen.getByTestId('quitter-le-groupe')).getByRole('button', { name: 'Quitter le groupe' }));
    expect(retirer).toHaveBeenCalledWith({ user_id: 1 }, expect.anything());
  });

  it('un admin renomme, ajoute et gère ; un membre ne voit aucun de ces gestes', () => {
    const { unmount } = render(withIntl(<InfosDuGroupe conversationId={5} />));
    expect(screen.getByLabelText('Renommer le groupe', { selector: 'input' })).toHaveValue('Fuite sous évier');
    expect(screen.getByRole('button', { name: 'Ajouter un participant' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gérer Fatou Wade' })).toBeInTheDocument();
    unmount();

    conversation.participants = [participant(1, 'Sokhna Sène'), participant(2, 'Fatou Wade', 'admin'), participant(3, 'Astou Sy')];
    render(withIntl(<InfosDuGroupe conversationId={5} />));
    expect(screen.queryByLabelText('Renommer le groupe', { selector: 'input' })).not.toBeInTheDocument();
    expect(screen.getByText('Fuite sous évier')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajouter un participant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Gérer / })).not.toBeInTheDocument();
    // Un membre non admin peut partir.
    expect(within(screen.getByTestId('quitter-le-groupe')).getByRole('button', { name: 'Quitter le groupe' })).toBeInTheDocument();
  });
});
