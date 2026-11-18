'use client';

import { useTranslations } from 'next-intl';

import { useBooking } from '@/lib/queries/bookings';
import type { Conversation } from '@/types/message';

import { useBailDeLaSalle } from './requetesDeLaSalle';
import { objetDeLaSalle, raisonDeLectureSeule } from './salle';

/**
 * TCK-2963 — la ligne qui remplace la saisie d'une salle en lecture seule (`abilities.can_send_message`
 * faux : bail fini, réservation close, bailleur parti, fil fermé). L'API ne rend que le booléen : la RAISON
 * est un code composé ici depuis le statut de l'objet, que le bandeau a déjà lu (même clé de requête).
 */
export function LectureSeuleDeLaSalle({ conversation }: { readonly conversation: Conversation }) {
  const objet = objetDeLaSalle(conversation);
  if (objet?.nature === 'booking') return <PourLaReservation conversation={conversation} id={objet.id} />;
  if (objet?.nature === 'lease') return <PourLeBail conversation={conversation} id={objet.id} />;
  return <Ligne code={raisonDeLectureSeule(conversation, null)} />;
}

function PourLeBail({ conversation, id }: { readonly conversation: Conversation; readonly id: number }) {
  const { data } = useBailDeLaSalle(id);
  return <Ligne code={raisonDeLectureSeule(conversation, data?.data?.status)} />;
}

function PourLaReservation({ conversation, id }: { readonly conversation: Conversation; readonly id: number }) {
  const { data } = useBooking(id);
  return <Ligne code={raisonDeLectureSeule(conversation, data?.data?.status)} />;
}

function Ligne({ code }: { readonly code: ReturnType<typeof raisonDeLectureSeule> }) {
  const t = useTranslations('messaging.salle.lectureSeule');
  return (
    <p role="status" data-testid="salle-en-lecture-seule" className="border-t border-border bg-card p-3 text-sm text-muted-foreground">
      {t(code)}
    </p>
  );
}
