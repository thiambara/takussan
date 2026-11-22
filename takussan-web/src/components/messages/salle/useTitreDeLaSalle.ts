'use client';

import { useTranslations } from 'next-intl';

import type { Conversation } from '@/types/message';

/**
 * TCK-2963 — le nom d'une salle se compose depuis son OBJET, jamais depuis `subject` (nul pour une salle,
 * TCK-2960) : « Bail · F3 Sacré-Cœur 3 », « Réservation · Studio Fann ». Le bien vient de la conversation
 * (`include=property` de la liste et du détail : la salle porte le `property_id` de son objet).
 */
export function useTitreDeLaSalle() {
  const t = useTranslations('messaging.salle.titre');
  return (conversation: Pick<Conversation, 'type' | 'property'>): string => {
    const nature = conversation.type === 'booking' ? 'booking' : 'lease';
    const bien = conversation.property?.title;
    return bien ? t(nature, { bien }) : t(`${nature}SansBien`);
  };
}
