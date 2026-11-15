'use client';

import { Send, SendHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * TCK-500 — l'habillage du composeur, partagé par les deux états d'un fil.
 *
 * Deux écrans composent désormais un message : `ChatView`, sur une conversation qui existe, et
 * `PropertyDraftChatView`, sur une conversation qui n'existe pas encore. Leurs mécaniques n'ont
 * presque rien en commun — l'un poste sur `/conversations/{id}/messages` et joint une note
 * vocale, l'autre appelle `contact-message` qui crée le fil et n'accepte qu'un texte — mais
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
  /** TCK-2632 — au-dessus du champ : les réponses rapides de l'agent, la pièce choisie. */
  readonly dessus?: React.ReactNode;
  readonly error?: string | null;
  readonly sendDisabled: boolean;
  readonly sendAriaLabel: string;
  /**
   * TCK-2632 — la forme de la messagerie (maquette `app-messagerie`, « Composeur ») : champ en
   * pilule, envoi rond, et à droite le micro (`apresLeChamp`) qui cède la place à l'envoi dès
   * qu'il y a quelque chose à envoyer (`envoiVisible`). Sans elle, l'habillage d'avant.
   */
  readonly messagerie?: { readonly apresLeChamp: React.ReactNode; readonly envoiVisible: boolean };
}

export function ChatComposerShell({
  onSubmit,
  children,
  leading,
  dessus,
  error,
  sendDisabled,
  sendAriaLabel,
  messagerie,
}: ChatComposerShellProps) {
  if (messagerie) {
    return (
      <form
        onSubmit={onSubmit}
        data-slot="composeur"
        // L'ombre n'existe qu'au téléphone : au bureau, la maquette n'en pose AUCUNE (`shadow-none`
        // y écrirait cinq ombres transparentes, que le relevé de fidélité distingue d'« aucune »).
        className="border-t border-border bg-card px-4 py-3 max-lg:shadow-barre-collante lg:bg-background lg:px-5"
      >
        {dessus}
        {error && (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex items-end gap-1.5">
          {leading}
          {children}
          {messagerie.apresLeChamp}
          {messagerie.envoiVisible ? (
            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0 rounded-full"
              disabled={sendDisabled}
              aria-label={sendAriaLabel}
            >
              <SendHorizontal className="size-5" aria-hidden />
            </Button>
          ) : null}
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmit} className="border-t border-border bg-card p-3">
      {dessus}
      {error && (
        <p role="alert" className="mb-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-end gap-2">
        {leading}
        {children}
        {/* 44 px sous `sm` (cible tactile), 36 px au-dessus — la hauteur du champ à côté. */}
        <Button
          type="submit"
          size="icon"
          className="size-11 shrink-0 sm:size-9"
          disabled={sendDisabled}
          aria-label={sendAriaLabel}
        >
          <Send className="size-4" aria-hidden />
        </Button>
      </div>
    </form>
  );
}
