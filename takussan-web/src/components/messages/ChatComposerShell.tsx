'use client';

import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * TCK-500 — l'habillage du composeur, partagé par les deux états d'un fil.
 *
 * Deux écrans composent désormais un message : `ChatView`, sur une conversation qui existe, et
 * `PropertyDraftChatView`, sur une conversation qui n'existe pas encore. Leurs mécaniques n'ont
 * presque rien en commun — l'un poste sur `/conversations/{id}/messages` et sait joindre un
 * fichier, l'autre appelle `contact-message` qui crée le fil et n'accepte qu'un texte — mais
 * leur ALLURE doit être la même : c'est le même champ, au même endroit, dans le même écran.
 *
 * Ce composant ne porte donc que la mise en forme : le cadre, la ligne d'erreur, la rangée et le
 * bouton d'envoi. Le champ de saisie et l'éventuel trombone sont FOURNIS par l'appelant, déjà
 * câblés à son propre formulaire. Mutualiser plus — la validation, le reset, l'envoi — aurait
 * demandé un composant à drapeaux qui aurait fini par décrire deux comportements au lieu d'un.
 */
interface ChatComposerShellProps {
  readonly onSubmit: (e: React.FormEvent) => void;
  /** Le champ de saisie, câblé par l'appelant (react-hook-form ici, `useState` là). */
  readonly children: React.ReactNode;
  /** Le trombone, ou rien du tout quand les pièces jointes n'ont pas de sens. */
  readonly leading?: React.ReactNode;
  readonly error?: string | null;
  readonly sendDisabled: boolean;
  readonly sendAriaLabel: string;
}

export function ChatComposerShell({
  onSubmit,
  children,
  leading,
  error,
  sendDisabled,
  sendAriaLabel,
}: ChatComposerShellProps) {
  return (
    <form onSubmit={onSubmit} className="border-t border-border bg-card p-3">
      {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
      <div className="flex items-end gap-2">
        {leading}
        {children}
        <Button type="submit" size="icon" disabled={sendDisabled} aria-label={sendAriaLabel}>
          <Send className="size-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
