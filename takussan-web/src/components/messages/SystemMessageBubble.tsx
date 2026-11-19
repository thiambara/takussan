'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { Message } from '@/types/message';
import { useTexteMessageSysteme } from './useTexteMessageSysteme';
import { IconeDEvenement, natureDeLIcone } from './engagements/IconeDEvenement';

interface SystemMessageBubbleProps {
  readonly message: Message;
}

const LIGNE = 'rounded-full bg-muted px-3 py-1 text-[0.6875rem] text-muted-foreground';

/**
 * TCK-085 — Inline neutral system event in a group thread.
 * Renders e.g. "Alice a ajouté Bob au groupe."
 *
 * Le texte se rend depuis les codes de `metadata` (`useTexteMessageSysteme`). TCK-2958 — un avis
 * d'intervention (`event`) passe par la même ligne, et `content` (un code) n'est jamais montré : un
 * code inconnu rend un libellé générique.
 */
export function SystemMessageBubble({ message }: SystemMessageBubbleProps) {
  const texteSysteme = useTexteMessageSysteme();
  // TCK-2972 (ADR-0130) — un événement d'engagement : la poignée de main, ou la cloche d'un rappel.
  const code = message.metadata?.code;
  const avecIcone = natureDeLIcone(code) !== null;

  return (
    <li className="flex justify-center">
      <span className={cn(LIGNE, avecIcone && 'inline-flex items-center gap-1.5')}>
        <IconeDEvenement code={code} className="size-3 flex-none" testId="icone-d-engagement" />
        {texteSysteme(message.metadata)}
      </span>
    </li>
  );
}

/**
 * TCK-2958 (ADR-0128) — une carte (`card`), tant que son rendu riche n'existe pas (TCK-2962) : une
 * ligne neutre, sans le code ni rien de l'objet.
 */
export function CarteNeutreBubble() {
  const t = useTranslations('messaging.chat');

  return (
    <li className="flex justify-center" data-slot="carte-neutre">
      <span className={LIGNE}>{t('carteNeutre')}</span>
    </li>
  );
}
