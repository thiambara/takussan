/**
 * TCK-2963 — la salle dans la liste des conversations : nommée depuis son objet (« Bail · F3 Sacré-Cœur 3 »),
 * jamais d'après l'un de ses membres comme une directe ; sous le nom, les autres membres.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

import { withIntl } from '@/test/intl';

import { AGENT, salleDeLaReservation, salleDuBail } from './donnees';

let pages: unknown[] = [];
vi.mock('@/lib/queries/conversations', () => ({
  useConversationsInfinite: () => ({
    data: { pages },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: { id: AGENT, roles: ['agent'] } }) }));

const { ConversationList } = await import('../../ConversationList');

describe('<ConversationList> — les salles (TCK-2963)', () => {
  it('nomme la salle depuis son objet et signe ses autres membres', () => {
    pages = [
      {
        data: [
          { ...salleDuBail(), last_message: null, unread_count: 0 },
          { ...salleDeLaReservation({ property: { id: 4, title: 'Studio Fann', slug: 'studio', main_photo_url: null } }), last_message: null, unread_count: 0 },
        ],
        meta: { current_page: 1, last_page: 1, counts: { all: 2, unread: 0, group: 0 } },
      },
    ];
    render(withIntl(<ConversationList selectedId={null} onSelect={vi.fn()} dense={false} />));

    expect(screen.getByText('Bail · F3 Sacré-Cœur 3')).toBeInTheDocument();
    expect(screen.getByText('Réservation · Studio Fann')).toBeInTheDocument();
    expect(screen.getAllByText('Ousmane Niang, Mouhamed Sène')).toHaveLength(2);
    expect(screen.getAllByTestId('pastille-de-la-salle')).toHaveLength(2);
    expect(screen.queryByText('Groupe')).toBeNull();
  });
});
