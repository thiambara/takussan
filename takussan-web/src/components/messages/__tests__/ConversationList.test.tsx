/**
 * TCK-645 — l'état vide de la liste des conversations.
 *
 * Relevé du porteur (390 px) : « Pas encore de conversation. » dans un cadre en pointillés, lui-même
 * dans la carte de la messagerie, puis un grand vide. Deux défauts : un cadre dans un cadre, et un
 * état vide qui constate sans dire quoi faire.
 *
 * Ce qu'il dit doit être VRAI dans le produit : le front ne crée en direct que des groupes. Un fil
 * 1↔1 naît du bouton « Envoyer un message » de la fiche d'une annonce (`ChatDraftContext`), ou
 * quand quelqu'un vous écrit.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import frMessages from '@/messages/fr.json';
import enMessages from '@/messages/en.json';
import { ConversationList } from '../ConversationList';

const conversations = vi.fn(() => ({ data: { data: [] }, isLoading: false, isError: false }));
vi.mock('@/lib/queries/conversations', () => ({
  useConversations: () => conversations(),
}));

function rendre() {
  return render(
    <NextIntlClientProvider locale="fr" messages={frMessages}>
      <ConversationList selectedId={null} onSelect={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe('<ConversationList> vide (TCK-645)', () => {
  it('dit comment une conversation commence, et mène aux annonces', () => {
    rendre();

    expect(screen.getByRole('heading', { name: frMessages.messaging.list.empty })).toBeInTheDocument();
    expect(screen.getByText(frMessages.messaging.list.emptyHint)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: frMessages.messaging.list.emptyCta })).toHaveAttribute(
      'href',
      '/properties',
    );
  });

  it('n’encadre pas l’état vide : la liste est déjà la surface', () => {
    rendre();

    const vide = screen.getByTestId('conversations-vide');
    expect(vide).not.toHaveClass('border');
    expect(vide).toHaveClass('border-0');
    // Il remplit la hauteur de la liste au lieu de flotter en haut d'un grand vide.
    expect(vide).toHaveClass('min-h-full');
  });
});

// TCK-671 (P06.02) — `last_message_preview` d'un avis système est écrit en français par l'API
// (`SystemMessageFactory::humanise()`) : la liste le dérive de `metadata.event`, dans la langue du lecteur.
describe('<ConversationList> aperçu d’un avis système (TCK-671)', () => {
  function conversation(lastMessage: Record<string, unknown>, preview: string) {
    return {
      id: 7,
      subject: 'Visites',
      property_id: null,
      type: 'group',
      status: 'active',
      last_message_at: '2026-10-16T10:00:00Z',
      last_message_preview: preview,
      participants: [],
      last_message: lastMessage,
    };
  }

  function rendreEn() {
    return render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <ConversationList selectedId={null} onSelect={() => {}} />
      </NextIntlClientProvider>,
    );
  }

  it('rend l’aperçu d’un changement de rôle dans la langue du lecteur', () => {
    conversations.mockReturnValue({
      data: {
        data: [
          conversation(
            { id: 1, type: 'system', metadata: { event: 'role_changed', actor_name: 'Alice', target_name: 'Bob', role: 'admin' } },
            'Alice a changé le rôle de Bob en admin',
          ),
        ],
      },
      isLoading: false,
      isError: false,
    } as never);

    rendreEn();

    expect(screen.getByText("Alice changed Bob's role to Admin.")).toBeInTheDocument();
    expect(screen.queryByText('Alice a changé le rôle de Bob en admin')).not.toBeInTheDocument();
  });

  it('garde l’aperçu du serveur pour un message ordinaire', () => {
    conversations.mockReturnValue({
      data: { data: [conversation({ id: 2, type: 'text', metadata: null }, 'Bonjour à tous')] },
      isLoading: false,
      isError: false,
    } as never);

    rendreEn();

    expect(screen.getByText('Bonjour à tous')).toBeInTheDocument();
  });
});
