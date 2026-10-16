'use client';

import type { Message } from '@/types/message';
import { useTexteMessageSysteme } from './useTexteMessageSysteme';

interface SystemMessageBubbleProps {
  readonly message: Message;
}

/**
 * TCK-085 — Inline neutral system event in a group thread.
 * Renders e.g. "Alice a ajouté Bob au groupe."
 *
 * Le texte se rend depuis les codes de `metadata` (`useTexteMessageSysteme`) ; `content`, écrit par
 * le serveur dans sa langue par défaut, reste le repli d'un code que ce front ne connaît pas.
 */
export function SystemMessageBubble({ message }: SystemMessageBubbleProps) {
  const texteSysteme = useTexteMessageSysteme();
  const text = texteSysteme(message.metadata) ?? message.content;

  return (
    <li className="flex justify-center">
      <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
        {text}
      </span>
    </li>
  );
}
