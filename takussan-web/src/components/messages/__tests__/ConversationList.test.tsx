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
