/**
 * TCK-683 (P13.03) — le composeur de la messagerie n'offre plus de pièce jointe.
 *
 * Le trombone postait le fichier sur `/api/conversations/{c}/messages/{m}/attachments`, qu'aucune
 * route de l'API ne sert : le texte partait, le fichier échouait sur « L'envoi du fichier a
 * échoué ». Le porteur a décidé de « retirer le trombone pour l'instant ». Ces tests gardent les
 * deux faces de ce retrait : aucun sélecteur de fichier n'est offert, et plus aucun code du front
 * ne vise la route absente.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { withIntl } from '@/test/intl';
import { ChatView } from '../ChatView';

vi.mock('@/lib/queries/conversations', () => ({
  useConversation: () => ({ data: { data: { id: 7, type: 'direct', participants: [] } } }),
  useMessagesInfinite: () => ({
    data: { pages: [{ data: [] }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  useNewMessagesPolling: vi.fn(),
  useMarkConversationRead: vi.fn(),
  useSendMessage: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));

vi.mock('../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));

function monter() {
  return render(withIntl(<ChatView conversationId={7} />));
}

describe('<ChatView> — composeur sans pièce jointe (TCK-683)', () => {
  it("n'offre ni trombone ni sélecteur de fichier", () => {
    const { container } = monter();

    expect(screen.queryByLabelText('Joindre un fichier')).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
  });

  /**
   * L'autre face : plus aucun code du front ne vise la route absente. Le hook
   * `useUploadAttachment` la visait aussi, sans appelant ; un retour du trombone sur cette même
   * route rougirait ici avant d'atteindre un utilisateur.
   */
  it('aucun fichier de src/ ne poste sur /messages/{m}/attachments', () => {
    const racine = path.resolve(__dirname, '../../..');
    const fautifs: string[] = [];
    const parcourir = (dossier: string) => {
      for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
        const chemin = path.join(dossier, e.name);
        if (e.isDirectory()) {
          if (e.name !== '__tests__') parcourir(chemin);
        } else if (/\.tsx?$/.test(e.name)) {
          if (/messages\/\$\{[^}]+\}\/attachments/.test(fs.readFileSync(chemin, 'utf8'))) {
            fautifs.push(path.relative(racine, chemin));
          }
        }
      }
    };
    parcourir(racine);

    expect(fautifs).toEqual([]);
  });
});
