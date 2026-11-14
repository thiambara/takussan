/**
 * TCK-683 (P13.03) — le trombone postait le fichier sur `/api/conversations/{c}/messages/{m}/attachments`,
 * qu'aucune route de l'API ne sert : le texte partait, le fichier échouait sur « L'envoi du fichier
 * a échoué ». Le porteur l'avait retiré « pour l'instant ».
 *
 * TCK-2632 le rend, depuis que l'API reçoit la pièce sur la route du texte (TCK-2631) : le
 * premier test dit désormais où il poste, le second garde toujours la route absente.
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
  useSendAttachment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  // TCK-2632 — l'en-tête du fil lit le contexte (appel, WhatsApp) et porte la sourdine.
  useConversationContext: () => ({ data: undefined }),
  useConsignerGesteDuClient: () => ({ mutateAsync: vi.fn(() => Promise.resolve()) }),
  useToggleMute: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/hooks/useIntersectionObserver', () => ({ useIntersectionObserver: () => false }));

vi.mock('../VoiceNoteRecorder', () => ({ VoiceNoteRecorder: () => null }));
vi.mock('../ConversationInfoSheet', () => ({ ConversationInfoSheet: () => null }));

function monter() {
  return render(withIntl(<ChatView conversationId={7} />));
}

describe('<ChatView> — la pièce jointe et sa route (TCK-683, TCK-2632)', () => {
  it('offre le trombone, et ses sélecteurs n’acceptent que photos et PDF', () => {
    const { container } = monter();

    expect(screen.getByRole('button', { name: 'Joindre une photo ou un document' })).toBeInTheDocument();
    const acceptes = [...container.querySelectorAll('input[type="file"]')].map((i) => i.getAttribute('accept'));
    expect(acceptes).toContain('image/jpeg,image/png,image/webp');
    expect(acceptes).toContain('application/pdf');
    expect(acceptes.every((a) => a === 'application/pdf' || a === 'image/jpeg,image/png,image/webp')).toBe(true);
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
