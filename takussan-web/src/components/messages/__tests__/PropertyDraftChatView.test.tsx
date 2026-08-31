/**
 * TCK-500 — le fil qui n'existe pas encore.
 *
 * Ces tests visent les deux propriétés qu'une régression plausible casserait en premier :
 *
 *   1. le brouillon est une VALEUR, pas un `placeholder` — le bouton d'envoi est actif avant la
 *      moindre frappe. Un retour au `placeholder` laisserait le champ vide et le bouton inerte ;
 *   2. rien n'est écrit tant que rien n'est envoyé — le montage ne déclenche aucune requête.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withIntl } from '@/test/intl';
import { PropertyDraftChatView } from '../PropertyDraftChatView';

const submitContactMessage = vi.fn();

vi.mock('@/app/actions/property', () => ({
  submitContactMessage: (...args: unknown[]) => submitContactMessage(...args),
}));

vi.mock('@/hooks/useTriggerMinimalProfileOnce', () => ({
  useTriggerMinimalProfileOnce: () => ({ triggerIfNeeded: vi.fn() }),
}));

const invalidateQueries = vi.fn(() => Promise.resolve());
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useQueryClient: () => ({ invalidateQueries }),
}));

const BIEN = {
  slug: 'villa-almadies',
  title: 'Villa 4 pièces aux Almadies',
  reference_number: 'TK-2451',
  main_photo_url: null,
};

function monter(onCreated = vi.fn()) {
  render(
    withIntl(
      <PropertyDraftChatView property={BIEN} recipientName="Fatou Ndiaye" onCreated={onCreated} />,
    ),
  );
  return { onCreated };
}

describe('<PropertyDraftChatView>', () => {
  beforeEach(() => {
    invalidateQueries.mockClear();
    submitContactMessage.mockReset();
    submitContactMessage.mockResolvedValue({ ok: true, data: { conversation_id: 42 } });
  });

  it('pré-remplit le champ avec le titre et la référence du bien', () => {
    monter();
    const champ = screen.getByTestId('chat-draft-textarea') as HTMLTextAreaElement;

    expect(champ.value).toContain('Villa 4 pièces aux Almadies');
    expect(champ.value).toContain('TK-2451');
  });

  /**
   * LE test qui distingue une valeur d'un `placeholder` : sans saisie, le bouton doit être
   * cliquable. Un retour au `placeholder` laisse le champ vide et le bouton désactivé.
   */
  it("laisse le bouton d'envoi actif sans aucune frappe", () => {
    monter();

    expect(screen.getByRole('button', { name: /envoyer/i })).toBeEnabled();
  });

  it("n'émet aucune requête au montage — la conversation naît de l'envoi", () => {
    monter();

    expect(submitContactMessage).not.toHaveBeenCalled();
  });

  it('envoie le brouillon tel quel et remonte le fil créé', async () => {
    const { onCreated } = monter();

    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(submitContactMessage).toHaveBeenCalledTimes(1);
    const [slug, texte] = submitContactMessage.mock.calls[0] as [string, string];
    expect(slug).toBe('villa-almadies');
    expect(texte).toContain('TK-2451');
    expect(onCreated).toHaveBeenCalledWith(42);
  });

  it("envoie le texte de l'utilisateur quand il a tout remplacé, et le défaut ne revient pas", async () => {
    monter();
    const champ = screen.getByTestId('chat-draft-textarea');

    await userEvent.clear(champ);
    await userEvent.type(champ, 'Bonjour, quel est le montant de la caution ?');

    expect((champ as HTMLTextAreaElement).value).toBe(
      'Bonjour, quel est le montant de la caution ?',
    );

    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    const [, texte] = submitContactMessage.mock.calls[0] as [string, string];
    expect(texte).toBe('Bonjour, quel est le montant de la caution ?');
    expect(texte).not.toContain('TK-2451');
  });

  it('refuse un champ vidé — il n’y a rien à envoyer', async () => {
    monter();

    await userEvent.clear(screen.getByTestId('chat-draft-textarea'));

    expect(screen.getByRole('button', { name: /envoyer/i })).toBeDisabled();
  });

  /** AC12 — `contact-message` n'accepte qu'un texte : une pièce jointe serait perdue en silence. */
  it('ne propose pas de pièce jointe tant que la conversation n’existe pas', () => {
    monter();

    expect(screen.queryByLabelText(/joindre un fichier/i)).not.toBeInTheDocument();
  });

  /**
   * Relevé au navigateur, pas en test : le fil créé restait invisible à la résolution pendant les
   * 30 s de `staleTime`, et un second clic sur « Envoyer un message » reposait le brouillon
   * par-dessus une conversation déjà ouverte. Passé le délai, l'écran se corrigeait seul — c'est
   * ce qui rend le défaut difficile à croire, et pourquoi il lui faut une garde.
   */
  it('invalide la résolution du bien après un envoi, pour que le fil neuf soit vu tout de suite', async () => {
    monter();

    await userEvent.click(screen.getByRole('button', { name: /envoyer/i }));

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['conversations', 'property', 'villa-almadies'],
    });
  });

  it('nomme le bien et son destinataire', () => {
    monter();

    expect(screen.getByText('Villa 4 pièces aux Almadies')).toBeInTheDocument();
    expect(screen.getByText(/Fatou Ndiaye/)).toBeInTheDocument();
  });
});
