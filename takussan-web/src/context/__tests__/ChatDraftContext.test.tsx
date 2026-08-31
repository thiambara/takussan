/**
 * TCK-500 — le canal entre la fiche d'un bien et la messagerie.
 *
 * Le test central est celui de l'URL. En dessous du point de rupture `md`, on quitte la fiche
 * pour `/app/messages`, et il aurait été bien plus simple d'y emporter le message :
 * `?draft=Bonjour…`. C'est précisément ce qu'on s'interdit — un tel lien, forgé et envoyé, pose
 * une phrase choisie par un tiers dans le composeur de sa victime, à envoyer d'un clic sous son
 * propre nom. `n_emporte_aucun_texte` rougirait sur cette régression et sur elle seule.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatDraftProvider, useChatDraft } from '../ChatDraftContext';
import type { PropertyConversationResolution } from '@/types/message';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

let estMobile = false;
vi.mock('@/hooks/useMatchesMedia', () => ({
  useMatchesMaxWidth: () => estMobile,
  useMatchesMedia: () => estMobile,
}));

const RESOLUTION: PropertyConversationResolution = {
  conversation_id: null,
  can_message: true,
  property: {
    id: 1,
    slug: 'villa-almadies',
    title: 'Villa 4 pièces aux Almadies',
    reference_number: 'TK-2451',
    main_photo_url: null,
  },
  recipient: { id: 7, name: 'Fatou Ndiaye', avatar_url: null },
};

function Sonde() {
  const chat = useChatDraft();
  return (
    <>
      <button type="button" onClick={() => chat?.ouvrirChatBien(RESOLUTION)}>
        contacter
      </button>
      <span data-testid="cible">{chat?.cible?.property.slug ?? 'aucune'}</span>
    </>
  );
}

describe('ChatDraftProvider', () => {
  beforeEach(() => {
    push.mockReset();
    estMobile = false;
  });

  it('au-dessus du point de rupture, pose la cible sans naviguer', async () => {
    render(
      <ChatDraftProvider>
        <Sonde />
      </ChatDraftProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'contacter' }));

    expect(screen.getByTestId('cible')).toHaveTextContent('villa-almadies');
    expect(push).not.toHaveBeenCalled();
  });

  it('en dessous du point de rupture, navigue vers la messagerie pleine page', async () => {
    estMobile = true;
    render(
      <ChatDraftProvider>
        <Sonde />
      </ChatDraftProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'contacter' }));

    expect(push).toHaveBeenCalledWith('/app/messages?property=villa-almadies');
    expect(screen.getByTestId('cible')).toHaveTextContent('aucune');
  });

  it("n'emporte aucun texte de message dans l'URL", async () => {
    estMobile = true;
    render(
      <ChatDraftProvider>
        <Sonde />
      </ChatDraftProvider>,
    );

    await userEvent.click(screen.getByRole('button', { name: 'contacter' }));

    const url = new URL(push.mock.calls[0]![0] as string, 'https://x');

    // Un seul paramètre, et c'est le slug. Ni le texte, ni la référence, ni un `?draft=`.
    expect([...url.searchParams.keys()]).toEqual(['property']);
    expect(url.search).not.toMatch(/draft|Bonjour|TK-2451/i);
  });

  it('rend null hors provider plutôt que de lever', () => {
    render(<Sonde />);

    expect(screen.getByTestId('cible')).toHaveTextContent('aucune');
  });
});
